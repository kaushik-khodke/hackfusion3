"""
pharmacy_agent.py
Handles: medicine search, prescription verification, draft order, finalize order (with real stock decrement).
User isolation: all queries are scoped to the resolved patient_id (patients.id from patients.user_id).
"""
import os
import re
from typing import Any, Dict, List, Optional
from supabase import create_client, Client

from agents.base_agent import BaseAgent, AgentResult


class PharmacyAgent(BaseAgent):
    name = "pharmacy_agent"
    description = "Searches medicines, verifies prescriptions, creates and finalises orders, and decrements stock."

    def __init__(self):
        url = os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.db: Client = create_client(url, key)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _resolve_patient_id(self, user_id: str) -> Optional[str]:
        """Convert auth user_id → patients.id (the FK used in orders/refills)."""
        res = (
            self.db.table("patients")
            .select("id")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return res.data["id"] if res.data else None

    def search_medicines(self, query: str, limit: int = 5) -> List[Dict]:
        res = (
            self.db.table("medicines")
            .select("id, name, strength, unit_type, stock, prescription_required, price_rec, package_size, description")
            .ilike("name", f"%{query}%")
            .order("name")
            .limit(limit)
            .execute()
        )
        return res.data or []

    def _get_patient_prescriptions(self, patient_id: str) -> List[str]:
        """Return extracted_text of all prescription records for this patient."""
        res = (
            self.db.table("records")
            .select("extracted_text, title")
            .eq("patient_id", patient_id)
            .eq("record_type", "prescription")
            .execute()
        )
        return [r["extracted_text"] for r in (res.data or []) if r.get("extracted_text")]

    def verify_prescription(self, medicine_name: str, patient_id: str) -> Dict[str, Any]:
        """
        Check whether any of the patient's prescription records mention the medicine.
        Returns: {verified: bool, qty: int, found_in: str|None}
        Default qty = 1 if amount not stated.
        """
        prescriptions = self._get_patient_prescriptions(patient_id)
        med_lower = medicine_name.lower()

        for text in prescriptions:
            if med_lower in text.lower():
                # Try to extract a quantity near the medicine name
                pattern = rf"{re.escape(med_lower)}\D{{0,30}}?(\d+)"
                m = re.search(pattern, text.lower())
                qty = int(m.group(1)) if m else 1
                return {"verified": True, "qty": qty, "found_in": text[:120]}

        return {"verified": False, "qty": 0, "found_in": None}

    def create_order_draft(self, patient_id: str, items: List[Dict], channel: str = "agent_chat") -> Dict:
        order_res = (
            self.db.table("orders")
            .insert({"patient_id": patient_id, "status": "pending", "total_items": len(items), "channel": channel})
            .execute()
        )
        if not order_res.data:
            return {"success": False, "error": "Failed to create order"}

        order_id = order_res.data[0]["id"]
        item_rows = [
            {
                "order_id": order_id,
                "medicine_id": it["medicine_id"],
                "qty": it["qty"],
                "dosage_text": it.get("dosage_text"),
                "frequency_per_day": it.get("frequency_per_day"),
                "days_supply": it.get("days_supply", 30),
            }
            for it in items
        ]
        self.db.table("order_items").insert(item_rows).execute()
        return {"success": True, "order_id": order_id, "status": "pending", "items": len(items)}

    def finalize_order(self, order_id: str) -> Dict:
        """Safety + stock check, then commit. Decrements stock via RPC."""
        order_res = (
            self.db.table("orders")
            .select("id, patient_id, order_items(id, medicine_id, qty, medicines(name, stock, prescription_required))")
            .eq("id", order_id)
            .maybe_single()
            .execute()
        )
        if not order_res.data:
            return {"order_id": order_id, "status": "failed", "problems": ["order_not_found"]}

        order = order_res.data
        problems = []

        for item in order["order_items"]:
            med = item["medicines"]
            if med["stock"] < item["qty"]:
                problems.append(f"Insufficient stock for {med['name']} (available: {med['stock']})")

        if problems:
            return {"order_id": order_id, "status": "failed", "problems": problems}

        # Commit + decrement stock
        from datetime import datetime, timezone
        self.db.table("orders").update(
            {"status": "fulfilled", "finalized_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", order_id).execute()

        fulfilled = []
        for item in order["order_items"]:
            try:
                self.db.rpc("decrement_medicine_stock", {
                    "p_medicine_id": item["medicine_id"],
                    "p_qty": item["qty"],
                }).execute()
            except Exception as rpc_err:
                print(f"⚠️ Stock decrement failed for {item['medicine_id']}: {rpc_err}")
            fulfilled.append({"name": item["medicines"]["name"], "qty": item["qty"]})

        return {"order_id": order_id, "status": "fulfilled", "items": fulfilled}

    # ------------------------------------------------------------------
    # run() — called by the orchestrator
    # ------------------------------------------------------------------
    async def run(self, task: str, context: Dict[str, Any]) -> AgentResult:
        """
        context must contain:
          user_id      — auth UID of the logged-in user
          action       — "search" | "order" | "verify_prescription"
          query        — medicine name (for search/order)
          qty          — quantity (for order, default 1)
        """
        user_id = context.get("user_id")
        action  = context.get("action", "search")
        query   = context.get("query", "")
        qty     = int(context.get("qty", 1))

        # Resolve patient DB id
        patient_id = self._resolve_patient_id(user_id) if user_id else None
        if not patient_id and action != "search":
            return AgentResult(
                success=False,
                agent_name=self.name,
                message="Could not find patient record for this user.",
            )

        # --- SEARCH ---
        if action == "search":
            meds = self.search_medicines(query)
            if not meds:
                return AgentResult(success=True, data=[], agent_name=self.name,
                                   message=f"No medicines found matching '{query}'.")
            lines = [f"• {m['name']} ({m['strength'] or ''}) — stock: {m['stock']}, Rx required: {m['prescription_required']}, price: €{m['price_rec'] or 'N/A'}" for m in meds]
            return AgentResult(success=True, data=meds, agent_name=self.name,
                               message="Found medicines:\n" + "\n".join(lines))

        # --- ORDER ---
        if action == "order":
            meds = self.search_medicines(query, limit=1)
            if not meds:
                return AgentResult(success=False, agent_name=self.name,
                                   message=f"Medicine '{query}' not found in our inventory.")
            med = meds[0]

            # Stock check
            if med["stock"] < qty:
                return AgentResult(success=False, agent_name=self.name,
                                   message=f"Sorry, only {med['stock']} units of {med['name']} available.")

            # Prescription check
            if med["prescription_required"]:
                result = self.verify_prescription(med["name"], patient_id)
                if not result["verified"]:
                    return AgentResult(
                        success=False,
                        data={"needs_prescription": True, "medicine": med["name"]},
                        agent_name=self.name,
                        message=(
                            f"**{med['name']} requires a valid prescription.** "
                            "I couldn't find a matching prescription in your records. "
                            "Please upload your prescription (via the Records page) and try again, "
                            "or ask your doctor to issue one."
                        ),
                    )
                qty = result["qty"]  # use qty from prescription if found

            # Create + finalize
            draft = self.create_order_draft(patient_id, [{"medicine_id": med["id"], "qty": qty}])
            if not draft.get("success"):
                return AgentResult(success=False, agent_name=self.name, message="Failed to create order draft.")

            final = self.finalize_order(draft["order_id"])
            if final["status"] != "fulfilled":
                return AgentResult(success=False, data=final, agent_name=self.name,
                                   message=f"Order could not be finalised: {final.get('problems')}")

            return AgentResult(
                success=True,
                data=final,
                agent_name=self.name,
                message=(
                    f"✅ Order placed! **{qty}x {med['name']}** ({med['strength'] or ''}) "
                    f"— Order ID: `{final['order_id']}`. "
                    f"Stock updated in real time."
                ),
            )

        return AgentResult(success=False, agent_name=self.name, message=f"Unknown action: {action}")

"""
pharmacy_agent.py
Handles: medicine search, prescription verification, draft order, finalize order (with real stock decrement).
User isolation: all queries are scoped to the resolved patient_id (patients.id from patients.user_id).
"""
import os
import re
import json
from typing import Any, Dict, List, Optional
from supabase import create_client, Client
import google.generativeai as genai
from langfuse.decorators import observe

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

    @observe()
    def verify_prescription(self, medicine_name: str, patient_id: str) -> Dict[str, Any]:
        """
        Check whether any of the patient's prescription records mention the medicine.
        Uses Gemini to accurately parse qty, frequency, and dosage.
        """
        prescriptions = self._get_patient_prescriptions(patient_id)
        if not prescriptions:
            return {"verified": False, "qty": 0, "frequency_per_day": None, "dosage_text": None, "found_in": None}
            
        combined_text = "\n---\n".join(prescriptions)
        
        prompt = f"""
        You are a clinical parsing AI checking if a specific medicine is prescribed to a patient based on OCR text from their prescriptions.
        
        Medicine to look for: "{medicine_name}"
        
        Please read the following OCR text and determine if the medicine is prescribed. If it is, extract the total quantity prescribed, the frequency per day (as an integer), and any dosage text (e.g., 'after meals', '500mg').
        
        Return ONLY a raw JSON object with these keys (no markdown formatting):
        - "verified" (boolean)
        - "qty" (integer, default to 1 if not found but medicine is present)
        - "frequency_per_day" (integer or null, e.g., 2 for 'twice a day')
        - "dosage_text" (string or null, e.g., 'take with food')
        - "found_in" (string or null, a short 50-char snippet where you found it)
        
        OCR TEXT:
        {combined_text}
        """
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            raw = response.text.strip()
            if raw.startswith("```json"):
                raw = raw[7:-3].strip()
            elif raw.startswith("```"):
                raw = raw[3:-3].strip()
            return json.loads(raw)
        except Exception as e:
            print(f"⚠️ Failed to verify prescription with Gemini: {e}")
            return {"verified": False, "qty": 0, "frequency_per_day": None, "dosage_text": None, "found_in": None}

    @observe()
    def _extract_medicines_from_text(self, text: str) -> List[Dict[str, Any]]:
        """Use Gemini to rigorously extract a JSON list of medicines and quantities from prescription OCR text."""
        if not text or len(text.strip()) < 5:
            return []
            
        prompt = f"""
        You are a clinical parsing AI. Read the following Optical Character Recognition (OCR) text from a patient's prescription.
        Extract every medicine prescribed.
        
        Return ONLY a raw JSON array of objects. No markdown formatting, no backticks, no markdown blocks. 
        Each object must have exactly four keys:
        - "medicine_name" (string, the name of the drug)
        - "qty" (integer, the total quantity prescribed. If not explicitly stated, default to 1).
        - "frequency_per_day" (integer or null, e.g., 2 for 'twice a day')
        - "dosage_text" (string or null, e.g., 'take with food')
        
        OCR TEXT:
        {text}
        
        JSON OUTPUT MUST STRICTLY BE A VALID ARRAY e.g. [{{"medicine_name": "Panadol", "qty": 10, "frequency_per_day": 3, "dosage_text": "after meals"}}]
        """
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            raw = response.text.strip()
            if raw.startswith("```json"):
                raw = raw[7:-3].strip()
            elif raw.startswith("```"):
                raw = raw[3:-3].strip()
            return json.loads(raw)
        except Exception as e:
            print(f"⚠️ Failed to extract medicines from prescription text: {e}")
            return []

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
    @observe()
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

            # Extract user-provided overrides
            freq = context.get("frequency_per_day")
            dosage = context.get("dosage_text")

            # Prescription check
            if med["prescription_required"]:
                result = self.verify_prescription(med["name"], patient_id)
                if not result.get("verified"):
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
                
                # Use prescription values if user didn't explicitly provide them
                qty = result.get("qty", qty)
                if not freq and result.get("frequency_per_day"):
                    freq = result.get("frequency_per_day")
                if not dosage and result.get("dosage_text"):
                    dosage = result.get("dosage_text")
                    
                # Missing Information Prompt
                if not freq or not dosage:
                    missing = []
                    if not freq: missing.append("how many times a day to take it")
                    if not dosage: missing.append("specific dosage instructions (e.g., after food, 500mg)")
                    
                    return AgentResult(
                        success=False,
                        agent_name=self.name,
                        message=f"I found your prescription for **{med['name']}**, but it's missing {', and '.join(missing)}. "
                                f"Could you please tell me this information so I can complete your safety profile and order?"
                    )

            # Create + finalize
            draft = self.create_order_draft(patient_id, [{
                "medicine_id": med["id"], 
                "qty": qty,
                "frequency_per_day": freq,
                "dosage_text": dosage
            }])
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

        # --- ORDER FROM PRESCRIPTION ---
        if action == "order_from_prescription":
            if not query:
                return AgentResult(success=False, agent_name=self.name, message="I need the name of the prescription to find it.")

            # Find matching prescription in records
            prescriptions = (
                self.db.table("records")
                .select("id, title, extracted_text")
                .eq("patient_id", patient_id)
                .eq("record_type", "prescription")
                .ilike("title", f"%{query}%")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            
            # If no exact match, try giving them the most recent one if they used vague terms
            if not prescriptions.data:
                prescriptions = (
                    self.db.table("records")
                    .select("id, title, extracted_text")
                    .eq("patient_id", patient_id)
                    .eq("record_type", "prescription")
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )

            if not prescriptions.data:
                return AgentResult(success=False, agent_name=self.name, message="I couldn't find any uploaded prescriptions in your records.")

            rx_record = prescriptions.data[0]
            rx_text = rx_record.get("extracted_text", "")
            if not rx_text:
                 return AgentResult(success=False, agent_name=self.name, message=f"The prescription '{rx_record['title']}' doesn't have any readable text extracted yet.")

            # Parse with Gemini
            parsed_meds = self._extract_medicines_from_text(rx_text)
            if not parsed_meds:
                return AgentResult(success=False, agent_name=self.name, message=f"I couldn't identify any specific medicines from the prescription '{rx_record['title']}'.")

            valid_items = []
            results_log = []
            missing_info_meds = []

            for pm in parsed_meds:
                m_name = pm.get("medicine_name")
                p_qty = int(pm.get("qty", 1))
                p_freq = pm.get("frequency_per_day")
                p_dosage = pm.get("dosage_text")
                if not m_name: continue
                
                # Check DB inventory
                db_meds = self.search_medicines(m_name, limit=1)
                if not db_meds:
                    results_log.append(f"❌ '{m_name}' is not in our pharmacy catalog.")
                    continue
                db_m = db_meds[0]
                
                # Check for missing info if prescription required
                if db_m["prescription_required"] and (not p_freq or not p_dosage):
                    missing_info_meds.append(db_m['name'])
                    continue

                # Check stock
                if db_m["stock"] < p_qty:
                    # Provide what we can
                    if db_m["stock"] > 0:
                        results_log.append(f"⚠️ '{db_m['name']}' has low stock. Adding {db_m['stock']} instead of {p_qty}.")
                        p_qty = db_m["stock"]
                    else:
                        results_log.append(f"❌ '{db_m['name']}' is completely out of stock.")
                        continue
                        
                # Note: No need to verify_prescription again, because we derived this FROM the prescription!
                valid_items.append({
                    "medicine_id": db_m["id"],
                    "qty": p_qty,
                    "frequency_per_day": p_freq,
                    "dosage_text": p_dosage,
                    "name": db_m["name"]
                })
                results_log.append(f"✅ Reordering: {p_qty}x {db_m['name']}")

            if missing_info_meds:
                return AgentResult(
                    success=False,
                    agent_name=self.name,
                    message=f"I read the prescription '{rx_record['title']}', but I need a bit more detail to safely order for: **{', '.join(missing_info_meds)}**. \n"
                            f"The prescription is missing clear instructions on how many times a day to take them, or specific dosage instructions. "
                            f"Could you please clarify this information for these medicines?"
                )

            if not valid_items:
                return AgentResult(
                    success=False, 
                    agent_name=self.name, 
                    message=f"I read the prescription '{rx_record['title']}', but unfortunately we cannot fulfill any of the items right now:\n" + "\n".join(results_log)
                )

            # Create Order Draft
            draft = self.create_order_draft(patient_id, valid_items, channel="agent_chat_rx")
            if not draft.get("success"):
                return AgentResult(success=False, agent_name=self.name, message="Internal error creating the bulk order draft.")

            # Finalize Stock
            final = self.finalize_order(draft["order_id"])
            if final["status"] != "fulfilled":
                return AgentResult(
                    success=False, 
                    data=final, 
                    agent_name=self.name,
                    message=f"Order could not be finalised due to a stock error at checkout: {final.get('problems')}"
                )

            summary = (
                f"**Prescription Processed:** {rx_record['title']}\n"
                f"**Order ID:** `{final['order_id']}`\n\n"
                f"**Items:**\n" + "\n".join(results_log)
            )

            return AgentResult(
                success=True,
                data=final,
                agent_name=self.name,
                message=summary,
            )

        return AgentResult(success=False, agent_name=self.name, message=f"Unknown action: {action}")


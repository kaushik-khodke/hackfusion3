"""
refill_agent.py
Checks which medicines are running low for the current patient and creates refill alerts.
"""
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from supabase import create_client, Client

from agents.base_agent import BaseAgent, AgentResult


class RefillAgent(BaseAgent):
    name = "refill_agent"
    description = "Detects medicines running out soon and creates proactive refill alerts."

    def __init__(self):
        url = os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.db: Client = create_client(url, key)

    def _resolve_patient_id(self, user_id: str) -> Optional[str]:
        res = (
            self.db.table("patients")
            .select("id")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return res.data["id"] if res.data else None

    def get_refill_candidates(self, patient_id: str, days_ahead: int = 7) -> List[Dict]:
        """Returns medicines predicted to run out within `days_ahead` days."""
        candidates = []
        now = datetime.utcnow()
        threshold = now + timedelta(days=days_ahead)
        seen = set()

        # Standard finalized orders
        res = (
            self.db.table("orders")
            .select("finalized_at, order_items(medicine_id, qty, days_supply, medicines(name, stock))")
            .eq("patient_id", patient_id)
            .eq("status", "finalized")
            .execute()
        )
        for order in (res.data or []):
            if not order.get("finalized_at"):
                continue
            try:
                fin = datetime.fromisoformat(order["finalized_at"].replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                continue
            for item in order.get("order_items", []):
                med_name = item["medicines"]["name"]
                if med_name in seen:
                    continue
                seen.add(med_name)
                days_supply = item.get("days_supply") or 30
                runout = fin + timedelta(days=days_supply)
                if now <= runout <= threshold:
                    candidates.append({
                        "medicine_id": item["medicine_id"],
                        "medicine_name": med_name,
                        "runout_date": runout.date().isoformat(),
                        "days_left": (runout - now).days,
                        "current_stock": item["medicines"]["stock"],
                    })
        return candidates

    def create_refill_alert(self, patient_id: str, medicine_id: str, runout_date: str) -> Dict:
        res = self.db.table("refill_alerts").insert({
            "patient_id": patient_id,
            "medicine_id": medicine_id,
            "predicted_runout_date": runout_date,
            "status": "pending",
        }).execute()
        return res.data[0] if res.data else {"error": "insert failed"}

    async def run(self, task: str, context: Dict[str, Any]) -> AgentResult:
        user_id = context.get("user_id")
        days_ahead = int(context.get("days_ahead", 7))

        patient_id = self._resolve_patient_id(user_id) if user_id else None
        if not patient_id:
            return AgentResult(success=False, agent_name=self.name,
                               message="Could not find patient record.")

        candidates = self.get_refill_candidates(patient_id, days_ahead)
        if not candidates:
            return AgentResult(success=True, data=[], agent_name=self.name,
                               message="No medicines running out in the next week. You're all stocked up! ✅")

        # Create alerts for each candidate
        for c in candidates:
            if c.get("medicine_id"):
                self.create_refill_alert(patient_id, c["medicine_id"], c["runout_date"])

        lines = [f"• {c['medicine_name']} — runs out in {c['days_left']} day(s) ({c['runout_date']})" for c in candidates]
        return AgentResult(
            success=True,
            data=candidates,
            agent_name=self.name,
            message="⚠️ Medicines running low:\n" + "\n".join(lines),
        )

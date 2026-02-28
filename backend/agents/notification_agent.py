"""
notification_agent.py
Logs notifications (order confirmations, refill alerts) to notification_logs.
Scoped strictly to the resolved patient_id.
"""
import os
from typing import Any, Dict, Optional
from supabase import create_client, Client

from agents.base_agent import BaseAgent, AgentResult


class NotificationAgent(BaseAgent):
    name = "notification_agent"
    description = "Logs order/refill notifications into notification_logs."

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

    def log(self, patient_id: str, channel: str, notif_type: str, payload: Dict) -> Dict:
        res = self.db.table("notification_logs").insert({
            "patient_id": patient_id,
            "channel": channel,
            "type": notif_type,
            "payload": payload,
            "status": "sent",
        }).execute()
        return res.data[0] if res.data else {"error": "insert failed"}

    async def run(self, task: str, context: Dict[str, Any]) -> AgentResult:
        user_id    = context.get("user_id")
        channel    = context.get("channel", "app")
        notif_type = context.get("type", "order_confirmation")
        payload    = context.get("payload", {})

        patient_id = self._resolve_patient_id(user_id) if user_id else None
        if not patient_id:
            return AgentResult(success=False, agent_name=self.name,
                               message="Could not resolve patient for notification.")

        result = self.log(patient_id, channel, notif_type, payload)
        return AgentResult(
            success=True,
            data=result,
            agent_name=self.name,
            message=f"📧 Notification logged (type: {notif_type}, channel: {channel}).",
        )

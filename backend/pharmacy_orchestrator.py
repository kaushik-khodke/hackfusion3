from typing import Dict, Any, List
from pharmacy_service import PharmacyService

class PharmacyOrchestrator:
    def __init__(self):
        self.service = PharmacyService()

    async def get_medicines(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Purpose: search medicines table.
        Input: {"query": "string", "limit": 10}
        """
        query = params.get("query", "")
        limit = params.get("limit", 10)
        return await self.service.get_medicines(query, limit)

    async def get_patient_orders(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Purpose: fetch a patient’s order history.
        Input: {"patient_id": "<uuid>", "limit": 50}
        """
        patient_id = params.get("patient_id")
        limit = params.get("limit", 50)
        if not patient_id:
            return []
        return await self.service.get_patient_orders(patient_id, limit)

    async def create_order_draft(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Purpose: create a draft order and items for a patient.
        Input: {"patient_id": "<uuid>", "channel": "chat", "items": [...]}
        """
        patient_id = params.get("patient_id")
        channel = params.get("channel", "chat")
        items = params.get("items", [])
        return await self.service.create_order_draft(patient_id, items, channel)

    async def finalize_order(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Purpose: perform final safety + stock check and commit the order.
        Input: {"order_id": "<uuid>"}
        """
        order_id = params.get("order_id")
        return await self.service.finalize_order(order_id)

    async def create_refill_alert(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Purpose: store a predicted run-out for proactive outreach.
        Input: {"patient_id": "<uuid>", "medicine_id": "<uuid>", "predicted_runout_date": "2024-03-15"}
        """
        patient_id = params.get("patient_id")
        medicine_id = params.get("medicine_id")
        predicted_runout_date = params.get("predicted_runout_date")
        return await self.service.create_refill_alert(patient_id, medicine_id, predicted_runout_date)

    async def get_refill_alerts(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Purpose: fetch pending refill alerts for a patient.
        Input: {"patient_id": "<uuid>"}
        """
        patient_id = params.get("patient_id")
        return await self.service.get_refill_alerts(patient_id)

    async def log_notification(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Purpose: insert a notification record.
        Input: {"patient_id": "<uuid>", "channel": "whatsapp", "type": "... ", "payload": {...}, "status": "queued"}
        """
        patient_id = params.get("patient_id")
        channel = params.get("channel")
        msg_type = params.get("type")
        payload = params.get("payload")
        status = params.get("status", "queued")
        return await self.service.log_notification(patient_id, channel, msg_type, payload, status)

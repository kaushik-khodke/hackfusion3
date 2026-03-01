"""
prescription_agent.py
Handles: verification of existing prescriptions in medical records, 
extraction of dosage (amount) and timing from OCR text, and 
identifying missing information.
"""
import os
import json
from typing import Any, Dict, List, Optional
from supabase import create_client, Client
import google.generativeai as genai
from langfuse.decorators import observe

from agents.base_agent import BaseAgent, AgentResult


class PrescriptionAgent(BaseAgent):
    name = "prescription_agent"
    description = "Verifies if a patient has a valid prescription for a medicine and extracts dosage/timing instructions."

    def __init__(self):
        url = os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.db: Client = create_client(url, key)
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

    def _resolve_patient_id(self, user_id: str) -> Optional[str]:
        res = (
            self.db.table("patients")
            .select("id")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return res.data["id"] if res.data else None

    def get_prescriptions(self, patient_id: str) -> List[Dict]:
        res = (
            self.db.table("records")
            .select("id, title, extracted_text, created_at")
            .eq("patient_id", patient_id)
            .eq("record_type", "prescription")
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []

    @observe()
    def verify_and_extract(self, medicine_name: str, patient_id: str) -> Dict[str, Any]:
        """
        Check existing prescriptions and extract amount/timing using Gemini.
        """
        records = self.get_prescriptions(patient_id)
        if not records:
            return {
                "verified": False,
                "needs_upload": True,
                "message": f"I couldn't find any prescriptions in your records for {medicine_name}."
            }

        combined_text = "\n---\n".join([r.get("extracted_text", "") for r in records if r.get("extracted_text")])
        if not combined_text.strip():
            return {
                "verified": False,
                "needs_upload": True,
                "message": "You have prescription records, but they don't have readable text. Please ensure they are scanned correctly."
            }

        prompt = f"""
        You are a clinical parsing AI. Check if the medicine "{medicine_name}" is prescribed in the OCR text below.
        
        If found, extract:
        1. "amount": The strength or dosage (e.g., '500mg', '1 tablet').
        2. "timing": The frequency or consumption timing (e.g., 'twice a day after meals', 'every 8 hours').
        
        Return ONLY a raw JSON object:
        {{
            "verified": boolean,
            "medicine_found": string or null,
            "amount": string or null,
            "timing": string or null,
            "frequency_per_day": integer or null (e.g., 3 for 'thrice daily'),
            "message": string (short summary of what you found or missed)
        }}

        OCR TEXT:
        {combined_text}
        """
        try:
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            raw = response.text.strip()
            if raw.startswith("```json"):
                raw = raw[7:-3].strip()
            elif raw.startswith("```"):
                raw = raw[3:-3].strip()
            return json.loads(raw)
        except Exception as e:
            print(f"⚠️ PrescriptionAgent extraction failed: {e}")
            return {"verified": False, "error": str(e), "message": "Internal error during prescription verification."}

    @observe()
    async def run(self, task: str, context: Dict[str, Any]) -> AgentResult:
        """
        context must contain:
          user_id       — auth UID
          medicine_name — name of medicine to check
          action        — "verify" (default)
        """
        user_id = context.get("user_id")
        medicine_name = context.get("medicine_name", task)
        action = context.get("action", "verify")

        patient_id = self._resolve_patient_id(user_id) if user_id else None
        if not patient_id:
            return AgentResult(success=False, agent_name=self.name, message="Patient not found.")

        # Check medicine requirements first
        med_res = self.db.table("medicines").select("prescription_required").ilike("name", f"%{medicine_name}%").limit(1).execute()
        if not med_res.data:
             return AgentResult(success=False, agent_name=self.name, message=f"Medicine '{medicine_name}' not found.")
        
        if not med_res.data[0]["prescription_required"]:
            return AgentResult(success=True, data={"verified": True, "rx_required": False}, agent_name=self.name, message=f"{medicine_name} does not require a prescription.")

        # Perform verification
        result = self.verify_and_extract(medicine_name, patient_id)
        
        if not result.get("verified"):
            return AgentResult(
                success=False,
                data={"needs_upload": True, "medicine": medicine_name},
                agent_name=self.name,
                message=result.get("message", f"Please upload a prescription for {medicine_name}.")
            )

        # Check for missing dosage/timing
        amount = result.get("amount")
        timing = result.get("timing")
        
        if not amount or not timing:
            missing = []
            if not amount: missing.append("amount/dosage")
            if not timing: missing.append("timing/frequency")
            
            return AgentResult(
                success=False,
                data={"needs_info": True, "missing": missing, "medicine": medicine_name},
                agent_name=self.name,
                message=f"I found your prescription for **{medicine_name}**, but I couldn't clearly identify the **{', and '.join(missing)}**. Could you please provide these details?"
            )

        return AgentResult(
            success=True,
            data=result,
            agent_name=self.name,
            message=f"✅ Prescription verified for **{medicine_name}**. Instructions: {amount}, {timing}."
        )

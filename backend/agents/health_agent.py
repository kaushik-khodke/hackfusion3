"""
health_agent.py
Wraps RAGService + ML engine for the logged-in patient's health records.
All records are scoped to the resolved patient_id.
"""
import os
import sys
from typing import Any, Dict, Optional
from supabase import create_client, Client

from agents.base_agent import BaseAgent, AgentResult

# RAG + ML live one level up
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from rag_service import RAGService
from ml_engine import analyze_risk


class HealthAgent(BaseAgent):
    name = "health_agent"
    description = "Searches patient medical records and analyses health risk using ML."

    def __init__(self):
        url = os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.db: Client = create_client(url, key)
        self.rag = RAGService(supabase_url=url, supabase_key=key)

    def _resolve_patient_id(self, user_id: str) -> Optional[str]:
        res = (
            self.db.table("patients")
            .select("id")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return res.data["id"] if res.data else None

    async def run(self, task: str, context: Dict[str, Any]) -> AgentResult:
        user_id = context.get("user_id")
        action  = context.get("action", "search")   # "search" | "analyze"

        patient_id = self._resolve_patient_id(user_id) if user_id else None
        if not patient_id:
            return AgentResult(success=False, agent_name=self.name,
                               message="Could not find patient record.")

        if action == "search":
            query = context.get("query", task)
            try:
                context_text = await self.rag.search_records(user_id=user_id, query=query)
            except Exception as e:
                return AgentResult(success=False, agent_name=self.name,
                                   message=f"Record search failed: {e}")
            if not context_text:
                return AgentResult(success=True, data=None, agent_name=self.name,
                                   message="No relevant medical records found for this query.")
            return AgentResult(success=True, data={"context": context_text},
                               agent_name=self.name,
                               message=f"Found relevant records:\n{context_text[:500]}")

        if action == "analyze":
            try:
                records = await self.rag.get_patient_records(user_id)
                result  = analyze_risk(records)
            except Exception as e:
                return AgentResult(success=False, agent_name=self.name,
                                   message=f"Health analysis failed: {e}")
            return AgentResult(
                success=True,
                data=result,
                agent_name=self.name,
                message=f"Risk level: **{result.get('risk_level', 'Unknown')}**. Vitals detected: {result.get('vitals_detected')}",
            )

        return AgentResult(success=False, agent_name=self.name,
                           message=f"Unknown action: {action}")

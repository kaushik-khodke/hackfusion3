"""
pharmacist_orchestrator.py
Detailed Pharmacist Assistant Orchestrator.
Uses Gemini function-calling to perform global lookups, run SQL queries, 
and resolve patient files dynamically using the sub-agents.
"""
import os
import json
import asyncio
from typing import Any, Dict, List
import google.generativeai as genai
from supabase import create_client, Client

from agents.base_agent import AgentResult
from agents.pharmacy_agent import PharmacyAgent
from agents.refill_agent import RefillAgent
from agents.health_agent import HealthAgent

# ── Tool declarations for Gemini ────────────────────────────────────────────
TOOLS = [
    {
        "function_declarations": [
            {
                "name": "search_patient",
                "description": (
                    "Search for a patient's exact user_id based on their name or partial name. "
                    "Use this first if you need to query their specific medical records or orders."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name_query": {"type": "string", "description": "Patient's name or external ID"}
                    },
                    "required": ["name_query"]
                }
            },
            {
                "name": "fetch_table_data",
                "description": (
                    "Fetch rows from a specified table in the pharmacy database. "
                    "Available tables: "
                    "- audit_logs (id, actor_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at) "
                    "- consent_requests (id, patient_id, doctor_id, status, access_type, reason, expires_at, approved_at, created_at, updated_at) "
                    "- doctors (id, user_id, name, license_id, specialization, verified, created_at, updated_at) "
                    "- document_chunks (id, record_id, patient_id, content, embedding, created_at, updated_at) "
                    "- medicines (id, name, strength, unit_type, stock, prescription_required, created_at, updated_at, product_id, pzn, price_rec, package_size, description, reorder_threshold, last_restocked_at) "
                    "- notification_logs (id, patient_id, channel, type, payload, status, created_at) "
                    "- order_history_raw (id, patient_external_id, patient_age, patient_gender, purchase_date, product_name, quantity, total_price_eur, dosage_frequency, prescription_required_raw) "
                    "- order_items (id, order_id, medicine_id, qty, dosage_text, frequency_per_day, days_supply) "
                    "- orders (id, patient_id, status, total_items, channel, created_at, finalized_at) "
                    "- patients (id, user_id, uhid, full_name, phone, date_of_birth, blood_group, emergency_name, emergency_contact, address, city, state, pincode, profile_completed, created_at, updated_at, smart_pin, external_id) "
                    "- profiles (id, role, full_name, phone, created_at, updated_at) "
                    "- records (id, patient_id, uploaded_by, record_type, title, record_date, doctor_name, notes, file_url, file_name, file_size, ipfs_hash, extracted_text, created_at, updated_at, ipfs_cid, sha256_hash, encrypted_metadata, file_size_bytes, file_type, encrypted) "
                    "- refill_alerts (id, patient_id, medicine_id, predicted_runout_date, status, created_at) "
                    "Use this to fetch data and analyze metrics. If you do not specify select_columns, all columns are retrieved."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "table_name": {"type": "string", "description": "Name of the table to fetch"},
                        "select_columns": {"type": "string", "description": "Optional comma-separated list of columns to retrieve. e.g. 'id, status'"}
                    },
                    "required": ["table_name"]
                }
            },
            {
                "name": "call_pharmacy_agent",
                "description": "Check inventory or verify a prescription for a specific patient.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["search"], "description": "check inventory"},
                        "query": {"type": "string", "description": "Medicine name"},
                        "user_id": {"type": "string", "description": "Patient user_id (optional, pass if checking prescriptions)"}
                    },
                    "required": ["action", "query"]
                }
            },
            {
                "name": "call_health_agent",
                "description": "Search medical records or run ML analysis for a specific patient.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["search", "analyze"], "description": "Search text or run ML risk analysis"},
                        "query": {"type": "string", "description": "Search query text (if action is 'search')"},
                        "user_id": {"type": "string", "description": "Exact Patient user_id (REQUIRED)"}
                    },
                    "required": ["action", "user_id"]
                }
            },
            {
                "name": "call_refill_agent",
                "description": "Check refill alerts for a specific patient.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days_ahead": {"type": "integer", "description": "Days window to check"},
                        "user_id": {"type": "string", "description": "Exact Patient user_id (REQUIRED)"}
                    },
                    "required": ["user_id"]
                }
            }
        ]
    }
]

SYSTEM_PROMPT = """
You are the **Master Pharmacist AI Copilot** — an administrative AI with absolute "God-Mode" access to the entire MyHealthChain pharmacy database.
You assist the Head Pharmacist.

You have access to powerful tools:
1. `search_patient`: Resolve names into UUIDs. (Always do this before looking up records!)
2. `fetch_table_data`: Fetch all records from a given table to answer sales, metrics, or global stock trend questions. You have a massive context window, so you can fetch entire tables and compute aggregates yourself.
3. `call_pharmacy_agent`: Find medicines in inventory.
4. `call_health_agent` & `call_refill_agent`: Deep dive into a specific patient's medical files if the Pharmacist asks about them.

RULES:
1. **Administrative Persona**: Be extremely concise, highly analytical, and professional. 
2. **Markdown formatting**: Always format data, monetary values, and important identifiers in clean Markdown tables or bulleted lists.
3. **Multi-Agent Chain**: If asked about a user's health ("Why does John Smith need this refill?"): Find John's `user_id` -> run `call_health_agent` on `user_id`.
4. **Data Privacy**: No data is hidden from you. You own the portal. Do your best to synthesize complex global states for the human.
"""

class PharmacistOrchestratorAgent:
    MAX_HISTORY_TURNS = 10

    def __init__(self):
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        self.model = genai.GenerativeModel("gemini-2.5-flash", tools=TOOLS)
        
        url = os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.db: Client = create_client(url, key)
        
        self.pharmacy = PharmacyAgent()
        self.refill = RefillAgent()
        self.health = HealthAgent()
        
        self._sessions: Dict[str, List[Dict]] = {}
    
    def _fetch_table_data(self, table_name: str, select_columns: str = "*") -> AgentResult:
        """Fetches rows for a given table via Supabase REST API."""
        allowed_tables = [
            "audit_logs", "consent_requests", "doctors", "document_chunks", 
            "medicines", "notification_logs", "order_history_raw", "order_items", 
            "orders", "patients", "profiles", "records", "refill_alerts"
        ]
        if table_name not in allowed_tables:
            return AgentResult(success=False, agent_name="pharmacist_orchestrator", message=f"Table '{table_name}' is not permitted. Allowed: {allowed_tables}")
            
        try:
            # We fetch rows for the AI to analyze in its context window
            # If asking for *, exclude embeddings to prevent massive payload size if table is document_chunks
            actual_select = select_columns if select_columns else "*"
            if table_name == "document_chunks" and actual_select == "*":
                actual_select = "id, record_id, patient_id, content, created_at, updated_at"
                
            res = self.db.table(table_name).select(actual_select).execute()
            data = res.data or []
            return AgentResult(success=True, data=data, agent_name="pharmacist_orchestrator", message=f"Fetched {len(data)} rows from {table_name}")
        except Exception as e:
            return AgentResult(success=False, agent_name="pharmacist_orchestrator", message=f"Database Error: {e}")
        
    def _search_patient(self, name_query: str) -> AgentResult:
        res = (
             self.db.table("patients")
             .select("id, user_id, full_name")
             .ilike("full_name", f"%{name_query}%")
             .limit(5)
             .execute()
        )
        data = res.data or []
        if not data:
            return AgentResult(success=False, agent_name="pharmacist_orchestrator", message="No patients found.")
        return AgentResult(success=True, data=data, agent_name="pharmacist_orchestrator", message=f"Found: {data}")

    def _get_history(self, session_id: str) -> List[Dict]:
        return self._sessions.get(session_id, [])

    def _append_history(self, session_id: str, role: str, content: str) -> None:
        if session_id not in self._sessions:
            self._sessions[session_id] = []
        self._sessions[session_id].append({"role": role, "content": content})
        max_msgs = self.MAX_HISTORY_TURNS * 2
        if len(self._sessions[session_id]) > max_msgs:
            self._sessions[session_id] = self._sessions[session_id][-max_msgs:]

    async def _dispatch(self, tool_name: str, args: Dict) -> AgentResult:
        if tool_name == "fetch_table_data":
             return await asyncio.to_thread(self._fetch_table_data, args.get("table_name", ""), args.get("select_columns", "*"))
        
        if tool_name == "search_patient":
             return await asyncio.to_thread(self._search_patient, args.get("name_query", ""))
             
        user_id = args.get("user_id", "")
        base_ctx = {"user_id": user_id}

        if tool_name == "call_pharmacy_agent":
            ctx = {**base_ctx, "action": args.get("action", "search"), "query": args.get("query", "")}
            return await self.pharmacy.run(args.get("query", ""), ctx)

        if tool_name == "call_refill_agent":
            ctx = {**base_ctx, "days_ahead": args.get("days_ahead", 7)}
            return await self.refill.run("check_refills", ctx)

        if tool_name == "call_health_agent":
            ctx = {**base_ctx, "action": args.get("action", "search"), "query": args.get("query", "")}
            return await self.health.run(args.get("query", ""), ctx)

        return AgentResult(success=False, message=f"Unknown tool: {tool_name}", agent_name="pharmacist_orchestrator")

    async def run(self, message: str, language: str = "en") -> Dict[str, Any]:
        """Pharmacist entry point."""
        session_id = "pharmacist_global_session"
        history = self._get_history(session_id)
        
        history_block = "\n--- CONVERSATION HISTORY ---\n"
        for msg in reversed(history[-self.MAX_HISTORY_TURNS * 2:]):
            history_block += f"{msg['role'].capitalize()}: {msg['content'][:300]}\n"
        history_block += "----------------------------\n"
        
        # Inject standard global snapshot (to minimize SQL overhead for simple things)
        inventory_res = await asyncio.to_thread(self.db.table("medicines").select("name, stock").execute)
        orders_res = await asyncio.to_thread(self.db.table("orders").select("status").execute)
        
        inv = inventory_res.data or []
        ord = orders_res.data or []
        pending = len([o for o in ord if o["status"] == "pending"])
        
        full_prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"[Live Simple Summary Cache]\n"
            f"Total Inventory Items: {len(inv)}\n"
            f"Total Pending Orders: {pending}\n\n"
            f"IMPORTANT INSTRUCTION: The user has selected the language code '{language}'. "
            f"You MUST read the user's query and provide your ENTIRE final response strictly in the requested language "
            f"('{language}'). If '{language}' is 'hi', speak in Hindi. If '{language}' is 'mr', speak in Marathi. If '{language}' is 'en', speak in English.\n"
            f"Do not mix languages. Do not reply in English if 'hi' or 'mr' is selected.\n\n"
            f"{history_block}\n"
            f"Pharmacist: {message}"
        )

        chat = self.model.start_chat()
        response = await asyncio.to_thread(chat.send_message, full_prompt)

        agents_used = ["pharmacist_orchestrator"]
        steps = []

        for _ in range(6):
            try:
                part = response.candidates[0].content.parts[0]
                if not part.function_call:
                    break
            except (IndexError, AttributeError):
                break

            fc = part.function_call
            tool_name = fc.name
            args = type(fc).to_dict(fc).get("args", {})

            print(f"🤖 Pharmacist Agent → {tool_name}({args})")

            result = await self._dispatch(tool_name, args)
            agents_used.append(result.agent_name)
            steps.append({"agent": result.agent_name, "message": result.message, "success": result.success})

            response = await asyncio.to_thread(
                chat.send_message,
                genai.protos.Content(parts=[
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=tool_name,
                            response={"result": result.message, "data": json.dumps(result.data or {})}
                        )
                    )
                ])
            )

        final_text = response.text if hasattr(response, "text") else "I'm sorry, I encountered an internal error processing that request."

        self._append_history(session_id, "user", message)
        self._append_history(session_id, "assistant", final_text)

        return {
            "success": True,
            "response": final_text,
            "agents_used": list(set(agents_used)),
            "steps": steps,
        }

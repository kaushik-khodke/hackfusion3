"""
orchestrator_agent.py
The brain: receives the user message, uses Gemini function-calling to decide
which specialist agents to call (and in what order), then synthesises a final reply.

User isolation is enforced by passing user_id in every sub-agent context.
"""
import os
import json
from typing import Any, Dict, List
import google.generativeai as genai

from agents.base_agent import AgentResult
from agents.pharmacy_agent import PharmacyAgent
from agents.refill_agent import RefillAgent
from agents.notification_agent import NotificationAgent
from agents.health_agent import HealthAgent


# ── Tool declarations for Gemini ────────────────────────────────────────────
TOOLS = [
    {
        "function_declarations": [
            {
                "name": "call_pharmacy_agent",
                "description": (
                    "Search medicines, verify prescriptions, place or check orders. "
                    "Use action='search' to look up a medicine. "
                    "Use action='order' to purchase/refill a medicine (will check prescription automatically). "
                    "Set qty to the number of units (default 1)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["search", "order"], "description": "search or order"},
                        "query":  {"type": "string", "description": "Medicine name or partial name"},
                        "qty":    {"type": "integer", "description": "Number of units to order (default 1)"},
                    },
                    "required": ["action", "query"],
                },
            },
            {
                "name": "call_refill_agent",
                "description": (
                    "Check which of the patient's medicines are running out soon and create refill alerts. "
                    "Use when the user asks about running low, refills, or stock status."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days_ahead": {"type": "integer", "description": "Days window to check (default 7)"},
                    },
                },
            },
            {
                "name": "call_notification_agent",
                "description": "Log a notification (order confirmation, refill alert) for the patient.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "type":    {"type": "string", "description": "e.g. order_confirmation, refill_alert"},
                        "channel": {"type": "string", "description": "app, email, sms"},
                        "payload": {"type": "object", "description": "Notification details as JSON object"},
                    },
                    "required": ["type"],
                },
            },
            {
                "name": "call_health_agent",
                "description": "Search the patient's medical records or run an ML health-risk analysis.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["search", "analyze"], "description": "search records or analyze risk"},
                        "query":  {"type": "string", "description": "Search query (used when action=search)"},
                    },
                    "required": ["action"],
                },
            },
        ]
    }
]

SYSTEM_PROMPT = """
You are the **MyHealthChain Master AI Agent** — a senior healthcare assistant that coordinates specialist sub-agents.

You have access to four agent tools:
• call_pharmacy_agent  — search/order medicines, verify prescriptions
• call_refill_agent    — detect which medicines are running low and create alerts
• call_notification_agent — log confirmations and alerts
• call_health_agent    — search medical records, run health risk analysis

RULES:
1. **User isolation**: You already know the patient's user_id. Always pass it through. Never access another patient's data.
2. **Prescription policy**: If a medicine requires a prescription, the pharmacy_agent handles this automatically. If it reports `needs_prescription=true`, inform the user and stop — do not attempt to bypass.
3. **Stock is live**: Stock numbers come directly from the database. Trust them.
4. **Chain agents when needed**: e.g. for "refill my omega-3" — call refill_agent first to confirm need, then call pharmacy_agent to create the order, then call notification_agent to confirm.
5. **Synthesise a single reply**: After all tool calls finish, write one clean, friendly response. Include ✅/⚠️ emojis where appropriate. Mention order IDs so the patient can track.
6. **Scope**: Only handle health / pharmacy / record queries. Politely decline anything else.
7. **Language**: Respond in the same language the user writes in.
"""


class OrchestratorAgent:
    # Max turns to remember per user (each turn = 1 user msg + 1 assistant msg)
    MAX_HISTORY_TURNS = 10

    def __init__(self):
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        self.model        = genai.GenerativeModel("gemini-2.5-flash", tools=TOOLS)
        self.pharmacy     = PharmacyAgent()
        self.refill       = RefillAgent()
        self.notification = NotificationAgent()
        self.health       = HealthAgent()
        # Per-user conversation history: user_id → list of {"role": "user"|"assistant", "content": str}
        self._sessions: Dict[str, List[Dict]] = {}

    def _get_history(self, user_id: str) -> List[Dict]:
        return self._sessions.get(user_id, [])

    def _append_history(self, user_id: str, role: str, content: str) -> None:
        if user_id not in self._sessions:
            self._sessions[user_id] = []
        self._sessions[user_id].append({"role": role, "content": content})
        # Keep only the last MAX_HISTORY_TURNS turns (each = user + assistant message)
        max_msgs = self.MAX_HISTORY_TURNS * 2
        if len(self._sessions[user_id]) > max_msgs:
            self._sessions[user_id] = self._sessions[user_id][-max_msgs:]

    def _format_history(self, user_id: str) -> str:
        history = self._get_history(user_id)
        if not history:
            return ""
        lines = ["\n--- CONVERSATION HISTORY (most recent first) ---"]
        for msg in reversed(history[-self.MAX_HISTORY_TURNS * 2:]):
            prefix = "Patient" if msg["role"] == "user" else "Assistant"
            lines.append(f"{prefix}: {msg['content'][:300]}")
        lines.append("--- END OF HISTORY ---\n")
        return "\n".join(lines)

    async def _dispatch(self, tool_name: str, args: Dict, user_id: str) -> AgentResult:
        """Route a Gemini function call to the correct sub-agent."""
        base_ctx = {"user_id": user_id}

        if tool_name == "call_pharmacy_agent":
            ctx = {**base_ctx, "action": args.get("action", "search"),
                   "query": args.get("query", ""), "qty": args.get("qty", 1)}
            return await self.pharmacy.run(args.get("query", ""), ctx)

        if tool_name == "call_refill_agent":
            ctx = {**base_ctx, "days_ahead": args.get("days_ahead", 7)}
            return await self.refill.run("check_refills", ctx)

        if tool_name == "call_notification_agent":
            ctx = {**base_ctx, "type": args.get("type", "general"),
                   "channel": args.get("channel", "app"),
                   "payload": args.get("payload", {})}
            return await self.notification.run("log", ctx)

        if tool_name == "call_health_agent":
            ctx = {**base_ctx, "action": args.get("action", "search"),
                   "query": args.get("query", "")}
            return await self.health.run(args.get("query", ""), ctx)

        return AgentResult(success=False, message=f"Unknown tool: {tool_name}", agent_name="orchestrator")

    async def run(self, message: str, user_id: str, language: str = "en") -> Dict[str, Any]:
        """
        Main entry point called by the /pharmacy/chat endpoint.
        Injects conversation history into the prompt so the model remembers
        earlier turns from the same session (in-process memory, up to MAX_HISTORY_TURNS).
        """
        history_block = self._format_history(user_id)

        full_prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"Patient user_id: {user_id}\n"
            f"Language: {language}\n"
            f"{history_block}"
            f"Current user message: {message}"
        )

        chat    = self.model.start_chat()
        response = chat.send_message(full_prompt)

        agents_used: List[str] = []
        steps: List[Dict] = []
        max_iter = 6

        for _ in range(max_iter):
            try:
                part = response.candidates[0].content.parts[0]
                if not part.function_call:
                    break
            except (IndexError, AttributeError):
                break

            fc        = part.function_call
            tool_name = fc.name
            # Deep convert protobuf MapComposite to a standard Python dict
            args      = type(fc).to_dict(fc).get("args", {})

            print(f"🤖 Orchestrator → {tool_name}({args})")

            result = await self._dispatch(tool_name, args, user_id)
            agents_used.append(result.agent_name)
            steps.append({"agent": result.agent_name, "message": result.message, "success": result.success})

            response = chat.send_message(
                genai.protos.Content(parts=[
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=tool_name,
                            response={"result": result.message, "data": json.dumps(result.data or {})}
                        )
                    )
                ])
            )

        final_text = response.text if hasattr(response, "text") else "I wasn't able to complete that request."

        # Persist this turn to memory
        self._append_history(user_id, "user", message)
        self._append_history(user_id, "assistant", final_text)

        return {
            "success": True,
            "response": final_text,
            "agents_used": list(set(agents_used)),
            "steps": steps,
        }

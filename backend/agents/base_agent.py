"""
base_agent.py — Abstract base for all specialist agents.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class AgentResult:
    """Standardised result returned by every sub-agent."""
    success: bool
    data: Any = None            # structured payload (dict / list)
    message: str = ""           # human-readable summary for the orchestrator
    agent_name: str = ""        # which agent produced this
    errors: List[str] = field(default_factory=list)


class BaseAgent:
    """All specialist agents inherit from this."""
    name: str = "base"
    description: str = ""

    async def run(self, task: str, context: Dict[str, Any]) -> AgentResult:
        raise NotImplementedError

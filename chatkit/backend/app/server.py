"""ChatKit server that streams responses from a single assistant."""

from __future__ import annotations

import os
from typing import Any, AsyncIterator

from agents import Agent, Runner
from chatkit.agents import AgentContext, simple_to_agent_input, stream_agent_response
from chatkit.server import ChatKitServer
from chatkit.types import ThreadMetadata, ThreadStreamEvent, UserMessageItem

from .memory_store import MemoryStore

MAX_RECENT_ITEMS = 30


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


# Required: workflow created in the OpenAI Agent Builder
WORKFLOW_ID = _require_env("OPENAI_WORKFLOW_ID")

# Optional: pin the workflow version (recommended if you’re using versioned builder releases)
# If you leave this empty, it will use the default production version.
WORKFLOW_VERSION = os.getenv("OPENAI_WORKFLOW_VERSION", "").strip()

# IMPORTANT:
# This Agent points to the Agent Builder workflow instead of using a local model+instructions.
# The workflow itself contains Guardrails/Classify/File Search/Transform/agents, etc.
workflow_agent = Agent[AgentContext[dict[str, Any]]](
    # In the Agents SDK, you can reference a Builder workflow by its workflow id.
    # The exact field name is "workflow" in this starter pattern.
    workflow=WORKFLOW_ID,
    # Pin version when provided (your Builder shows version="2")
    version=WORKFLOW_VERSION or None,
    name="Josi.IA",
)


class StarterChatServer(ChatKitServer[dict[str, Any]]):
    """Server implementation that keeps conversation state in memory."""

    def __init__(self) -> None:
        self.store: MemoryStore = MemoryStore()
        super().__init__(self.store)

    async def respond(
        self,
        thread: ThreadMetadata,
        item: UserMessageItem | None,
        context: dict[str, Any],
    ) -> AsyncIterator[ThreadStreamEvent]:
        items_page = await self.store.load_thread_items(
            thread.id,
            after=None,
            limit=MAX_RECENT_ITEMS,
            order="desc",
            context=context,
        )
        items = list(reversed(items_page.data))
        agent_input = await simple_to_agent_input(items)

        agent_context = AgentContext(
            thread=thread,
            store=self.store,
            request_context=context,
        )

        result = Runner.run_streamed(
            workflow_agent,
            agent_input,
            context=agent_context,
        )

        async for event in stream_agent_response(agent_context, result):
            yield event

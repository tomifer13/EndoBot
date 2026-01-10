"""ChatKit server that streams responses by calling an Agent Builder workflow."""

from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator, Optional

import httpx
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


OPENAI_API_KEY = _require_env("OPENAI_API_KEY")
WORKFLOW_ID = _require_env("OPENAI_WORKFLOW_ID")
WORKFLOW_VERSION = os.getenv("OPENAI_WORKFLOW_VERSION", "").strip()  # ex: "2" (recommended)


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
        # Load recent items to build a simple text input
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

        # Convert agent_input to plain text prompt (simple_to_agent_input already structures it)
        # We’ll send it to the workflow via Responses API.
        user_text = ""
        try:
            # agent_input is typically a list of messages; keep it robust:
            if isinstance(agent_input, list) and agent_input:
                # best-effort: last user message text
                last = agent_input[-1]
                if isinstance(last, dict):
                    user_text = last.get("content", "") or last.get("text", "") or ""
        except Exception:
            user_text = ""

        if not user_text:
            user_text = "Olá! Pode enviar sua dúvida."

        # Build Responses API payload for a workflow
        payload: dict[str, Any] = {
            "workflow": WORKFLOW_ID,
            "input": user_text,
            "stream": True,
        }
        if WORKFLOW_VERSION:
            payload["version"] = WORKFLOW_VERSION

        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }

        # Stream from OpenAI and convert to ChatKit thread events
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/responses",
                headers=headers,
                json=payload,
            ) as resp:
                resp.raise_for_status()

                # The chatkit helper expects a "result" compatible stream.
                # stream_agent_response can handle streamed text events when provided a compatible iterator.
                # We'll yield raw SSE chunks as "delta" text items via chatkit's stream_agent_response.
                async def _sse_iter() -> AsyncIterator[str]:
                    async for line in resp.aiter_lines():
                        if line:
                            yield line

                # Use chatkit helper to translate streamed output to UI events
                async for event in stream_agent_response(agent_context, _sse_iter()):
                    yield event

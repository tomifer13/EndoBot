"""ChatKit server that streams responses from an Agent Builder workflow."""

from __future__ import annotations

import os
import json
from typing import Any, AsyncIterator

import httpx
from chatkit.agents import AgentContext, simple_to_agent_input
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
WORKFLOW_VERSION = os.getenv("OPENAI_WORKFLOW_VERSION", "").strip()  # "2"


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
        # Load recent items and extract the latest user message as text
        items_page = await self.store.load_thread_items(
            thread.id,
            after=None,
            limit=MAX_RECENT_ITEMS,
            order="desc",
            context=context,
        )
        items = list(reversed(items_page.data))
        agent_input = await simple_to_agent_input(items)

        # Best-effort: grab the latest user text from agent_input
        user_text = ""
        if isinstance(agent_input, list) and agent_input:
            last = agent_input[-1]
            if isinstance(last, dict):
                user_text = (
                    last.get("content")
                    or last.get("text")
                    or ""
                )

        if not user_text:
            user_text = "Olá! Pode enviar sua dúvida."

        # Build Responses API payload to run the workflow
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

        agent_context = AgentContext(
            thread=thread,
            store=self.store,
            request_context=context,
        )

        # Helper: yield ChatKit events
        async def _yield_text(text: str) -> AsyncIterator[ThreadStreamEvent]:
            # Minimal ChatKit-compatible streaming event:
            # We emit "assistant_message_delta" style events via the store helpers.
            # ChatKit expects ThreadStreamEvent objects; simplest is to use store.append/emit pattern.
            # However, ChatKit provides a generic "message delta" event type in chatkit.types.
            from chatkit.types import AssistantMessageDeltaEvent

            yield AssistantMessageDeltaEvent(delta=text)

        # Stream SSE from Responses API and emit deltas
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/responses",
                headers=headers,
                json=payload,
            ) as resp:
                resp.raise_for_status()

                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data = line[6:].strip()
                    else:
                        continue

                    if data == "[DONE]":
                        break

                    # Each data line is JSON
                    try:
                        evt = json.loads(data)
                    except Exception:
                        continue

                    # Extract text deltas from common Responses stream shapes
                    # We handle a few patterns safely.
                    text_delta = ""

                    # Pattern A: output_text.delta
                    if evt.get("type") == "output_text.delta":
                        text_delta = evt.get("delta", "") or ""

                    # Pattern B: response.output_text.delta (older wrappers)
                    if not text_delta and "delta" in evt and isinstance(evt["delta"], str):
                        text_delta = evt["delta"]

                    if text_delta:
                        async for e in _yield_text(text_delta):
                            yield e

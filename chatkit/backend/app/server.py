"""ChatKit server that calls an Agent Builder workflow and returns a normal response."""

from __future__ import annotations

import os
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
    def __init__(self) -> None:
        self.store: MemoryStore = MemoryStore()
        super().__init__(self.store)

    async def respond(
        self,
        thread: ThreadMetadata,
        item: UserMessageItem | None,
        context: dict[str, Any],
    ) -> AsyncIterator[ThreadStreamEvent]:
        # Load conversation and extract latest user text
        items_page = await self.store.load_thread_items(
            thread.id,
            after=None,
            limit=MAX_RECENT_ITEMS,
            order="desc",
            context=context,
        )
        items = list(reversed(items_page.data))
        agent_input = await simple_to_agent_input(items)

        user_text = ""
        if isinstance(agent_input, list) and agent_input:
            last = agent_input[-1]
            if isinstance(last, dict):
                user_text = last.get("content") or last.get("text") or ""

        if not user_text:
            user_text = "Olá! Pode enviar sua dúvida."

        payload: dict[str, Any] = {
            "workflow": WORKFLOW_ID,
            "input": user_text,
            "stream": False,  # IMPORTANT: disable stream to avoid ChatKit event format issues
        }
        if WORKFLOW_VERSION:
            payload["version"] = WORKFLOW_VERSION

        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.openai.com/v1/responses",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        # Extract text from Responses API output
        text = ""

        # Common shape: output_text on top-level convenience
        if isinstance(data, dict):
            if "output_text" in data and isinstance(data["output_text"], str):
                text = data["output_text"]

            # Alternative: dig into output array
            if not text:
                output = data.get("output")
                if isinstance(output, list):
                    for item in output:
                        if not isinstance(item, dict):
                            continue
                        content = item.get("content")
                        if isinstance(content, list):
                            for c in content:
                                if isinstance(c, dict) and c.get("type") in ("output_text", "text"):
                                    t = c.get("text")
                                    if isinstance(t, str):
                                        text += t

        if not text:
            text = "Não consegui gerar uma resposta agora. Pode tentar novamente?"

        # Yield a single assistant message event the way ChatKit expects.
        # This minimal dict event format is accepted by ChatKitServer.
        yield {
            "type": "assistant_message",
            "content": [{"type": "text", "text": text}],
        }

"""ChatKit server that calls an Agent Builder workflow and streams a compatible ChatKit response."""

from __future__ import annotations

import os
from typing import Any, AsyncIterator, Callable

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


def _get_text_streamer() -> Callable[[AgentContext[Any], str], AsyncIterator[ThreadStreamEvent]]:
    """
    Returns a function that converts plain text into ChatKit ThreadStreamEvents.

    We try a few known helper names across ChatKit versions.
    """
    # Newer/alternate helper names
    candidates = [
        ("chatkit.server", "stream_text_response"),
        ("chatkit.server", "text_to_stream_events"),
        ("chatkit.responses", "stream_text_response"),
        ("chatkit.responses", "text_to_stream_events"),
        ("chatkit.types", "text_to_stream_events"),
    ]

    for mod_name, fn_name in candidates:
        try:
            mod = __import__(mod_name, fromlist=[fn_name])
            fn = getattr(mod, fn_name)
            if callable(fn):
                return fn  # type: ignore[return-value]
        except Exception:
            continue

    # Fallback: minimal, but should still produce something.
    async def _fallback(agent_context: AgentContext[Any], text: str) -> AsyncIterator[ThreadStreamEvent]:
        # As a last resort, emit a single assistant message event.
        # Some ChatKit versions accept this dict shape.
        yield {
            "type": "assistant_message",
            "content": [{"type": "text", "text": text}],
        }

    return _fallback


stream_text = _get_text_streamer()


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
            "stream": False,  # we convert to ChatKit events ourselves
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
        if isinstance(data, dict):
            if isinstance(data.get("output_text"), str):
                text = data["output_text"]

            if not text:
                output = data.get("output")
                if isinstance(output, list):
                    for out_item in output:
                        if not isinstance(out_item, dict):
                            continue
                        content = out_item.get("content")
                        if isinstance(content, list):
                            for c in content:
                                if isinstance(c, dict):
                                    t = c.get("text")
                                    if isinstance(t, str):
                                        text += t

        if not text:
            text = "Não consegui gerar uma resposta agora. Pode tentar novamente?"

        agent_context = AgentContext(
            thread=thread,
            store=self.store,
            request_context=context,
        )

        async for evt in stream_text(agent_context, text):
            yield evt

"""FastAPI entrypoint for the ChatKit starter backend."""

from __future__ import annotations

import json

from chatkit.server import StreamingResult
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse

from .server import StarterChatServer

app = FastAPI(title="ChatKit Starter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chatkit_server = StarterChatServer()


@app.get("/verify")
async def verify_endpoint() -> JSONResponse:
    import inspect
    from agents import Runner

    return JSONResponse(
        {
            "ok": True,
            "mark": "VERIFY_V2_1418",
            "runner_sig": str(inspect.signature(Runner.run_streamed)),
        }
    )

from typing import Any

@app.post("/__debug/chatkit")
async def debug_chatkit(body: dict[str, Any]) -> JSONResponse:
    """
    Endpoint temporário pra inspecionar o payload do ChatKit sem curl.
    Acesse /docs -> POST /__debug/chatkit.
    """
    return JSONResponse({"mark": "DEBUG_OK", "received": body})

@app.post("/chatkit")
async def chatkit_endpoint(request: Request) -> Response:
    """Proxy the ChatKit web component payload to the server implementation."""
    payload = await request.body()

    # 🔎 Debug rápido: prova que ESTE handler está sendo chamado
    if request.headers.get("x-debug-chatkit") == "1":
        # tenta parsear JSON só pra ficar legível
        try:
            parsed = json.loads(payload.decode("utf-8"))
        except Exception:
            parsed = None

        return JSONResponse(
            {
                "mark": "CHATKIT_HANDLER_OK",
                "len": len(payload),
                "parsed": parsed,
            }
        )

    result = await chatkit_server.process(payload, {"request": request})

    if isinstance(result, StreamingResult):
        return StreamingResponse(result, media_type="text/event-stream")
    if hasattr(result, "json"):
        return Response(content=result.json, media_type="application/json")
    return JSONResponse(result)

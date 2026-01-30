"""Vercel serverless function — exchanges a workflow id for a ChatKit client secret.

This is a serverless equivalent of backend/app/main.py, adapted for Vercel's
Python runtime which expects a BaseHTTPRequestHandler-based handler.
"""

from __future__ import annotations

import json
import os
import uuid
from http.server import BaseHTTPRequestHandler

import httpx

DEFAULT_CHATKIT_BASE = "https://api.openai.com"
SESSION_COOKIE_NAME = "chatkit_session_id"
SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30  # 30 days


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return self._send({"error": "Missing OPENAI_API_KEY"}, 500)

        body = self._read_body()
        workflow_id = self._resolve_workflow_id(body)
        if not workflow_id:
            return self._send({"error": "Missing workflow id"}, 400)

        user_id, new_cookie = self._resolve_user()
        api_base = (
            os.getenv("CHATKIT_API_BASE")
            or os.getenv("VITE_CHATKIT_API_BASE")
            or DEFAULT_CHATKIT_BASE
        )

        try:
            with httpx.Client(base_url=api_base, timeout=10.0) as client:
                upstream = client.post(
                    "/v1/chatkit/sessions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "OpenAI-Beta": "chatkit_beta=v1",
                        "Content-Type": "application/json",
                    },
                    json={"workflow": {"id": workflow_id}, "user": user_id},
                )
        except httpx.RequestError as error:
            return self._send(
                {"error": f"Failed to reach ChatKit API: {error}"}, 502, new_cookie
            )

        payload = self._parse_json(upstream)
        if not upstream.is_success:
            message = payload.get("error") if isinstance(payload, dict) else None
            message = message or upstream.reason_phrase or "Failed to create session"
            return self._send({"error": message}, upstream.status_code, new_cookie)

        client_secret = payload.get("client_secret") if isinstance(payload, dict) else None
        expires_after = payload.get("expires_after") if isinstance(payload, dict) else None

        if not client_secret:
            return self._send({"error": "Missing client secret in response"}, 502, new_cookie)

        return self._send(
            {"client_secret": client_secret, "expires_after": expires_after},
            200,
            new_cookie,
        )

    # -- helpers --

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, ValueError):
            return {}

    def _resolve_workflow_id(self, body: dict) -> str | None:
        workflow = body.get("workflow", {})
        wf_id = workflow.get("id") if isinstance(workflow, dict) else None
        wf_id = wf_id or body.get("workflowId")
        env_wf = os.getenv("CHATKIT_WORKFLOW_ID") or os.getenv("VITE_CHATKIT_WORKFLOW_ID")
        if not wf_id and env_wf:
            wf_id = env_wf
        if wf_id and isinstance(wf_id, str) and wf_id.strip():
            return wf_id.strip()
        return None

    def _resolve_user(self) -> tuple[str, str | None]:
        cookie_header = self.headers.get("Cookie", "")
        for part in cookie_header.split(";"):
            part = part.strip()
            if part.startswith(f"{SESSION_COOKIE_NAME}="):
                return part.split("=", 1)[1], None
        user_id = str(uuid.uuid4())
        return user_id, user_id

    def _send(self, payload: dict, status: int, cookie_value: str | None = None):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        if cookie_value:
            secure = "; Secure" if os.getenv("VERCEL") else ""
            self.send_header(
                "Set-Cookie",
                f"{SESSION_COOKIE_NAME}={cookie_value}; Max-Age={SESSION_COOKIE_MAX_AGE_SECONDS}; "
                f"HttpOnly; SameSite=Lax; Path=/{secure}",
            )
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    @staticmethod
    def _parse_json(response: httpx.Response) -> dict:
        try:
            parsed = response.json()
            return parsed if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, ValueError):
            return {}

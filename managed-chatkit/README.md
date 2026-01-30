# Managed ChatKit starter

Vite + React UI that talks to a FastAPI session backend for creating ChatKit
workflow sessions.

## Quick start

```bash
npm install           # installs root deps (concurrently)
npm run dev           # runs FastAPI on :8000 and Vite on :3000
```

What happens:

- `npm run dev` runs the backend via `backend/scripts/run.sh` (FastAPI +
  uvicorn) and the frontend via `npm --prefix frontend run dev`.
- The backend exposes `/api/create-session`, exchanging your workflow id and
  `OPENAI_API_KEY` for a ChatKit client secret. The Vite dev server proxies
  `/api/*` to `127.0.0.1:8000`.

## Required environment

- `OPENAI_API_KEY`
- `VITE_CHATKIT_WORKFLOW_ID`
- (optional) `CHATKIT_API_BASE` or `VITE_CHATKIT_API_BASE` (defaults to `https://api.openai.com`)
- (optional) `VITE_API_URL` (override the dev proxy target for `/api`)

Set the env vars in your shell (or process manager) before running. Use a
workflow id from Agent Builder (starts with `wf_...`) and an API key from the
same project and organization.

## Deploy to Vercel

The project includes a `vercel.json`, a serverless Python function
(`api/create-session.py`), and a `requirements.txt` so it can be deployed to
Vercel out of the box.

1. Install the [Vercel CLI](https://vercel.com/docs/cli) and log in.
2. From the `managed-chatkit/` directory, run:
   ```bash
   vercel deploy --prod
   ```
3. In your Vercel project settings, add the following environment variables
   for the **Production** environment:
   - `OPENAI_API_KEY`
   - `VITE_CHATKIT_WORKFLOW_ID`
   - `CHATKIT_WORKFLOW_ID`
4. Add your Vercel deployment domain (e.g. `your-project.vercel.app`) to the
   [OpenAI domain allowlist](https://platform.openai.com/settings/organization/security/domain-allowlist).
   Without this step the ChatKit widget will render a blank screen.
5. Redeploy so the build picks up the environment variables:
   ```bash
   vercel deploy --prod
   ```

## Customize

- UI: `frontend/src/components/ChatKitPanel.tsx`
- Session logic: `backend/app/main.py` (local dev) / `api/create-session.py` (Vercel)

# ChatKit Starter Template

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![NextJS](https://img.shields.io/badge/Built_with-NextJS-blue)
![OpenAI API](https://img.shields.io/badge/Powered_by-OpenAI_API-orange)

This repository is the simplest way to bootstrap a [ChatKit](http://openai.github.io/chatkit-js/) application. It ships with a minimal Next.js UI, the ChatKit web component, and a ready-to-use session endpoint so you can experiment with OpenAI-hosted workflows built using [Agent Builder](https://platform.openai.com/agent-builder).

## What You Get

- Next.js app with `<openai-chatkit>` web component and theming controls
- API endpoint for creating a session at [`app/api/create-session/route.ts`](app/api/create-session/route.ts)
- Config file for starter prompts, theme, placeholder text, and greeting message

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

Copy the example file and fill in the required values:

```bash
cp .env.example .env.local
```

You can get your workflow id from the [Agent Builder](https://platform.openai.com/agent-builder) interface, after clicking "Publish":

<img src="./public/docs/workflow.jpg" width=500 />

You can get your OpenAI API key from the [OpenAI API Keys](https://platform.openai.com/api-keys) page.

### 3. Configure ChatKit credentials

Update `.env.local` with the variables that match your setup.

- `OPENAI_API_KEY` — This must be an API key created **within the same org & project as your Agent Builder**. If you already have a different `OPENAI_API_KEY` env variable set in your terminal session, that one will take precedence over the key in `.env.local` one (this is how a Next.js app works). So, **please run `unset OPENAI_API_KEY` (`set OPENAI_API_KEY=` for Windows OS) beforehand**.
- `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID` — This is the ID of the workflow you created in [Agent Builder](https://platform.openai.com/agent-builder), which starts with `wf_...`
- (optional) `CHATKIT_API_BASE` - This is a customizable base URL for the ChatKit API endpoint

> Note: if your workflow is using a model requiring organization verification, such as GPT-5, make sure you verify your organization first. Visit your [organization settings](https://platform.openai.com/settings/organization/general) and click on "Verify Organization".

### 4. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000` and start chatting. Use the prompts on the start screen to verify your workflow connection, then customize the UI or prompt list in [`lib/config.ts`](lib/config.ts) and [`components/ChatKitPanel.tsx`](components/ChatKitPanel.tsx).

### 5. Deploy your app

```bash
npm run build
```

Before deploying your app, you need to verify the domain by adding it to the [Domain allowlist](https://platform.openai.com/settings/organization/security/domain-allowlist) on your dashboard.

## Customization Tips

- Adjust starter prompts, greeting text, [chatkit theme](https://chatkit.studio/playground), and placeholder copy in [`lib/config.ts`](lib/config.ts).
- Update the event handlers inside [`components/.tsx`](components/ChatKitPanel.tsx) to integrate with your product analytics or storage.

## References

- [ChatKit JavaScript Library](http://openai.github.io/chatkit-js/)
- [Advanced Self-Hosting Examples](https://github.com/openai/openai-chatkit-advanced-samples)

## Modifying Introduction

The starter app's opening greeting was customized as part of recent edits. Summary of what was changed and why:

- **Greeting text**: updated the start-screen greeting to "Hi, I am Sean's Digital Avatar, how can I help you today?" by changing the constant in `lib/config.ts`.

- **Attempted non-streaming responses**: I initially tried to request non-streaming assistant responses by forwarding a `response_streaming` flag. The ChatKit client and upstream session API rejected that parameter, so I removed the unsupported parameter to avoid runtime errors.

- **Files changed**:
  - `lib/config.ts` — greeting text updated.
  - `components/ChatKitPanel.tsx` — removed unsupported `response_streaming` parameter from the client request; organized `chatkit` options and preserved start-screen configuration.

- **How to test**:

	1. Ensure your `.env.local` is configured with `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID` and `OPENAI_API_KEY`.
	2. Run the dev server:

```bash
npm run dev
```

	3. Visit `http://localhost:3000` and confirm the greeting appears on the start screen and that there are no runtime console errors about unknown session parameters.

- **If you want final-only responses**: some ChatKit deployments may support a different session flag or require server-side configuration. If you want, I can:
	- Log the upstream `create-session` response to inspect accepted session flags, or
	- Add a UI-level filter to hide interim deltas when they appear.

If you'd like me to revert these edits to the original repository state at any time, say "revert to original" and I will restore the original files.

## Development Notes

Short summary of the current development state and helpful tips for testing or reverting changes.

- **Current working changes**:
	- `lib/config.ts` — start-screen greeting updated; added `HIDE_INTERIM_RESPONSES` flag (default `true`).
	- `components/ChatKitPanel.tsx` — best-effort UI filter added to hide interim/streaming assistant fragments; fixed an iteration bug by using a `Map` for bookkeeping.
	- `README.md` — documentation of modifications and testing steps (this file).

- **Where backups live**: I created safe local backups before edits in `dev-backups/`:
	- `dev-backups/config.ts.bak`
	- `dev-backups/ChatKitPanel.tsx.bak`
	- `dev-backups/README.md.bak`

- **Toggle the interim-response filter**: to quickly disable the UI-level hiding behavior, set the flag in `lib/config.ts`:

```ts
// in lib/config.ts
export const HIDE_INTERIM_RESPONSES = false;
```

- **How to revert to backups manually**:

```bash
cp dev-backups/config.ts.bak lib/config.ts
cp dev-backups/ChatKitPanel.tsx.bak components/ChatKitPanel.tsx
cp dev-backups/README.md.bak README.md
```

- **How to revert using git** (if you prefer):

```bash
git checkout -- lib/config.ts components/ChatKitPanel.tsx README.md
```

- **Testing notes**:
	1. Start the dev server: `npm run dev` and open `http://localhost:3000`.
	2. Open your browser DevTools Console (Cmd+Option+I on macOS) and enable "Preserve log".
	3. Ask a question that typically produces streaming/partial assistant output and observe whether interim fragments are hidden and only the final response appears.
	4. If something looks wrong, set `HIDE_INTERIM_RESPONSES = false` and reload to restore original rendering.

- **Known runtime caveats**:
	- A prior runtime error `suppressed.forEach is not a function` was fixed by switching from `WeakMap` to `Map` for suppressed element bookkeeping.
	- You may still see React developer warnings or errors in the console (minified messages such as React error #185). If they appear, copy the full console output (preferably in non-minified dev mode) and share it so I can diagnose further.

If you'd like any of these items committed to a new branch, or prefer I create a Git commit with the changes and a short message, tell me and I'll do it before we finish.

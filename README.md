# Beside

A voice trainer that sits next to you while you code or practice aptitude. You tell it what you're building. It says hi by name, stays quiet while you type, and steps in when you get stuck. It reads your code, hints at the logic, and only offers the next line when you really need it. Tab accepts that line.

Built for Build with Agora, Bengaluru 2026. Track PS51, AI Agents That Get Things Done.

Live: https://in-class-pi.vercel.app

## The demo

1. Type "a calculator program", your name, pick Code and Python, press play.
2. Beside says: "Hey Anubhav, what's new today? Oh, so today you're building a calculator program, huh? Nice."
3. Type `def add(a, b):` and its return, then start `def calc(op, a, b):` and stop.
4. Press the faded **Stuck?** button. Line 4 lights up, and Beside talks about the logic in words. It doesn't show any code yet.
5. Press **Stuck?** again. A faded next line appears in the editor. Press Tab to take it.
6. Go quiet for 25 seconds, or delete and rewrite a chunk. Beside notices on its own and checks in.
7. Switch to Aptitude with "trains and relative speed". Beside writes the formula in the side panel and checks your arithmetic with `calculate` before saying you're right.

## How it works

The browser sends your voice to Agora Conversational AI. Agora runs Deepgram speech-to-text and a managed OpenAI model, and Murf Falcon speaks the reply.

When you're stuck, the board sends your numbered code to the agent through the Agora client toolkit `think` call. The agent then calls this app's tools over HTTPS:

- `read_code` returns what's in the editor, with line numbers. Returns `empty_code` if nothing is typed yet.
- `post_hint` puts a hint, a formula, or a one-line suggestion on screen. It refuses with `too_early` when the learner has only been stuck once, `not_one_line` for multi-line code, `line_too_long`, or `empty_hint`. The agent reads the error, fixes its call, and retries.
- `calculate` does exact arithmetic for aptitude. Returns `bad_expression` or `divide_by_zero`.
- `save_milestone` adds a win to the side panel and resets the help level.

Help comes in three levels. Level 1 is a nudge in words. Level 2 points at the exact line and can include the next line. Level 3 gives the line and explains why it works. The server checks the level, so the model can't skip ahead.

Every session is stored under its own Agora channel name. Tool calls include a shared secret header (`x-tool-secret`) that Agora fills in from template variables.

## Setup

In the Vercel project:

1. Turn off Deployment Protection so Agora can reach the tool routes.
2. Add the Upstash Redis integration. Without it, state lives in server memory, which works for a single warm instance.
3. Set `NEXT_PUBLIC_AGORA_APP_ID`, `NEXT_AGORA_APP_CERTIFICATE`, `MURF_API_KEY`, `TOOL_SECRET`, and `PUBLIC_BASE_URL`.

Optional: `MURF_VOICE_ID` (default `Matthew`) and `MURF_LOCALE` (default `en-US`).

```powershell
npx vercel@latest deploy --prod --yes
```

Local:

```powershell
copy env.example .env.local
npx pnpm@9.15.9 install
npx pnpm@9.15.9 dev
```

## Checks

```powershell
npx pnpm@9.15.9 run verify:coach
npx pnpm@9.15.9 run verify:api
node scripts/probe-live.mjs
```

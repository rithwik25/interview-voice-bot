# Voice Interview Agent

A low-latency, **speech-to-speech** voice agent that answers job interviews on the
candidate's behalf — grounded in a real resume — and **improves itself** after each
session via a post-call coach agent. Browser-only (no SIP/phone).

## Architecture

```
Interviewer browser ──WebRTC audio──► OpenAI Realtime (gpt-realtime-2.1)
        │  (ephemeral token)                  ▲
        ▼                                      │ instructions + tools + transcription
  Next.js API (Vercel)  ── /api/session ───────┘   bound to the token (server-side)
        ├─ /api/transcript   persist transcript + tool flags
        ├─ /api/analyze      coach agent (AI SDK + GPT) → critique + prompt patch
        └─ /api/prompt       versioned prompt registry (apply / rollback)
```

**Why these choices**
- **Speech-to-speech over WebRTC** → ~300–800ms responses, native barge-in. Audio
  goes browser↔OpenAI directly; our server is never in the media path.
- **Ephemeral token** → the real API key + the full prompt/profile stay server-side;
  the interviewer's browser never sees them.
- **No DB for the MVP** → the entire profile + STAR stories fit in the model context,
  so grounding needs zero tool round-trips. (Swap `src/lib/store.ts` for Neon Postgres
  when the knowledge base outgrows the context window.)
- **Self-improvement loop** → every session is transcribed (both sides), a coach agent
  critiques it and proposes a full prompt rewrite, and you approve it as a new
  **version** (with rollback). Prompts are never silently overwritten.

## Setup

```bash
cp .env.example .env   # add your real values
npm install
npm run dev
```

Open http://localhost:3000 →
- **/interview** — the call UI. Click *Start interview*, allow the mic, talk.
- **/review** — analyze past sessions, apply prompt improvements, manage versions.

## Deployment

Live at **https://elyx-sigma.vercel.app** (Vercel project `rithwik-7088s-projects/elyx`).

- **Persistence**: Neon Postgres (Vercel Marketplace integration). `src/lib/store.ts`
  dispatches to Postgres when `DATABASE_URL` is set, else to the local `.data/` file
  store — so local dev needs zero DB setup. Schema is auto-created on first request
  (`src/lib/db.ts` → `ensureSchema`).
- **Env vars on Vercel**: `OPENAI_API_KEY`, `APP_BASIC_AUTH_USERNAME`,
  `APP_BASIC_AUTH_PASSWORD`, `DATABASE_URL`, and optional model/voice overrides
  (production + preview).
- **Redeploy**: `vercel deploy --prod`.

## Key files

| Path | Purpose |
|---|---|
| `src/data/profile.json` | Reconciled candidate facts (source of truth) |
| `src/data/star-stories.json` | Behavioral-question source material |
| `src/data/personal-qa.json` | **HR / personal / fit answers** (why switch, hobbies, strengths, comp, etc.) — edit freely |
| `src/data/deep-dives.ts` | **Technical deep-dive KB** for deep questions about each role/project — fill the `[VERIFY]` specifics |
| `src/data/prompt-versions.json` | Seed base instructions (v1) |
| `src/lib/prompt.ts` | Composes instructions + profile + stories |
| `src/lib/realtime-config.ts` | Realtime session config (model, voice, VAD, tools) |
| `src/lib/realtime-client.ts` | Browser WebRTC client + event handling |
| `src/app/api/session/route.ts` | Mints ephemeral Realtime token |
| `src/app/api/analyze/route.ts` | Post-session coach agent (structured output) |
| `src/lib/store.ts` | File-based persistence (swap for a DB in prod) |

## Answering deep technical questions

`src/data/deep-dives.ts` holds a rich entry per role/project (architecture, key
decisions, tradeoffs, likely follow-ups) that's loaded into the agent's context.
It's seeded with everything safely derivable (real tech stacks + standard knowledge
about those technologies). **Implementation specifics only you know are marked
`[VERIFY]`** — replace them with your real details (exact metrics, design choices,
library versions) and remove the tag. Until you do, the agent answers `[VERIFY]`
topics at a principled engineering level and flags them, rather than inventing
specifics (which is what gets caught in technical interviews).

## Tools the agent can call

- `flag_uncertain(topic, reason)` — non-blocking; marks anything it couldn't answer
  confidently so it surfaces in `/review` and feeds the improvement loop.

## Notes / next steps

- The `.data/` directory holds sessions + prompt versions locally. Serverless
  filesystems are ephemeral — move to Neon Postgres before deploying to Vercel.
- Model/voice are configurable via env (`REALTIME_MODEL`, `REALTIME_VOICE`).

# Design Plan: Real-Time Voice Interview Agent ("speaks as me") with Self-Improvement Loop

## Context

You want a voice agent that represents you in job interviews (used with the interviewer's permission — they consent to talking to your AI representative). Requirements:
1. **Minimal latency** — must feel like a live human conversation.
2. **Self-improvement** — after each session, a second agent reads the transcript and refines the voice agent's prompt/logic.
3. **Answer the interviewer's questions** — grounded in your resume + background.
4. **UI-based, no SIP/phone** — browser app.

Confirmed decisions:
- **Audio routing:** **self-contained browser call** — the interviewer opens a shareable link and talks to the agent directly in their browser. No virtual mic, no Zoom, no media relay. (Revised from virtual-mic approach to remove complexity.)
- **Engine:** speech-to-speech model (OpenAI Realtime / `gpt-realtime`) for lowest latency.
- **Voice:** generic high-quality voice (no clone).
- **Stack:** Next.js App Router on Vercel.
- **Tools:** kept minimal and latency-optimized. No `log_question`/`save_followup` tools — everything is recovered from a high-quality transcript in post-session analysis.

> Note: impersonation/ethics concerns are out of scope per your instruction — usage is consented by the interviewer. A "human takeover / monitor" view remains available but optional.

---

## High-Level Architecture

```
   ┌──────────────────────────────────────────────┐        ┌──────────────────────────────┐
   │   Interviewer's Browser (opens shared link)   │        │   Your Monitor View (optional)│
   │                                                │        │   live captions, takeover     │
   │   mic ──►┌──────────────────────────────┐      │        └───────────────┬───────────────┘
   │          │  WebRTC peer (audio in/out)  │◄─ agent voice out               │ (read-only sync)
   │  speaker◄┤  OpenAI Realtime gpt-realtime │      │                          │
   │          └──────────────┬───────────────┘      │                          │
   └──────────────────────────│──────────────────────┘                          │
            (ephemeral token) │           tool calls (RAG, company info)         │
                              ▼                                                   │
              ┌──────────────────────────────────┐                              │
              │  Next.js API routes (Vercel)      │◄─────────────────────────────┘
              │  • /api/session  (create link,    │
              │      mint ephemeral token)        │
              │  • /api/rag      (fast lookup)    │
              │  • /api/transcript (persist)      │
              │  • /api/analyze  (coach agent)    │
              └──────────────┬────────────────────┘
                             ▼
              ┌──────────────────────────────────┐
              │  Data layer (Vercel Marketplace)  │
              │  • Neon Postgres + pgvector (KB)  │
              │  • Vercel Blob (resume + audio)   │
              │  • prompt_versions, sessions,     │
              │    transcript_turns, eval_set     │
              └──────────────────────────────────┘
```

**Key latency choice:** the interviewer's browser talks **directly** to OpenAI Realtime over **WebRTC** using a short-lived ephemeral token minted by `/api/session`. Audio never round-trips through Vercel — the backend is control-plane only (token mint, RAG, persistence, analysis). This is the single biggest latency win and is now even simpler because there's exactly one browser in the audio path.

---

## Component 1 — Real-Time Voice Core (low latency)

**Engine:** OpenAI Realtime API (`gpt-realtime`) via **WebRTC** (not WebSocket).
- **Why speech-to-speech:** a STT→LLM→TTS pipeline serializes three hops (~1–2.5s). One speech-to-speech model listens, reasons, and speaks in a single pass (~300–800ms to first audio) with native **barge-in/interruption** — essential for natural interview turn-taking.
- **Why WebRTC over WebSocket:** native Opus, adaptive jitter buffer, packet-loss concealment, browser-native mic/speaker. No hand-rolled audio framing.
- **Why ephemeral token + direct connection:** real API key stays server-side; audio flows browser↔OpenAI with no media proxy hop.

**Turn detection:** server-side **semantic VAD** so the agent waits for the interviewer to finish a thought (interviewers pause mid-sentence) instead of interrupting on silence.

**Latency tactics:**
- Preload stable context (system prompt + condensed resume + top STAR stories) into the session config at connect → zero per-turn fetch for common answers.
- Tools used only for *deep* lookups, with a short filler ack ("Sure — let me speak to that…") that hides the tool round-trip behind speech.
- Tight output verbosity via instructions.

---

## Component 2 — Self-Contained Browser Call (no virtual mic)

The interviewer opens a **shareable session link** (e.g. `/interview/<token>`). Their browser:
- captures **their mic** as the Realtime input track,
- plays the **agent's voice** out their speakers,
- holds the WebRTC connection to OpenAI directly (ephemeral token from `/api/session`).

That's the whole audio path — **no virtual audio device, no Zoom, no relay server.** You (the candidate) don't need to be present; the agent *is* you.

**Optional monitor view** (`/monitor/<session>`): a read-only page where you watch live captions and can hit **takeover / pause** (mutes the agent so you can speak, or ends the session). Implemented via a lightweight channel (e.g. broadcast of transcript events); does not sit in the audio path, so it adds no latency.

**Why this is better:** removes the single most fragile, OS-dependent piece (BlackHole/VB-Cable, tab-audio capture) and the need for any media SFU. Fewer moving parts = lower latency and far less to break.

---

## Component 3 — Knowledge & Grounding (accurate answers)

**Two tiers:**
1. **In-context (hot path):** condensed resume, headline achievements, 5–8 pre-written **STAR stories**, target role/company one-pager — loaded into the session prompt for instant, zero-latency answers.
2. **RAG (cold path):** personal knowledge base for the long tail (specific projects, metrics, tech deep-dives, past employers, logistics). Embeddings in **Neon Postgres + pgvector**, queried by a tool.

**Ingestion:** upload resume + docs → **Vercel Blob** → chunk + embed (AI SDK `embed`) → pgvector. Re-runnable as you add material.

**Your actual data sources (already on disk):**
- `/Users/apple/Desktop/job_agent/src/data/profile.json` — structured facts (skills, education, work auth, CTC current/expected = 30 LPA, references, achievements). Maps cleanly into the in-context hot path + structured logistics answers.
- `/Users/apple/Desktop/rithwik_resume.pdf` — narrative resume; parsed and chunked into pgvector for the RAG long tail.

**⚠️ Reconcile before ingestion (the two sources disagree — fix to avoid the agent stating a wrong current employer):**
- **Missing current role:** PDF has **AI Engineer — Cornerstone OnDemand, Hyderabad (Feb 2026 – Present)**; `profile.json` lacks it and still implies Quadeye is current. → add to JSON, mark as current.
- **Quadeye end date:** JSON *Aug–Nov 2025* vs PDF *Aug–Dec 2025*. → pick one.
- **Skills delta:** PDF adds C++, Flask, TensorFlow, Keras, Sklearn, CrewAI, **LiveKit** (notable — directly relevant to this very project). → merge into JSON.
- Treat **`profile.json` as the single source of truth** post-reconciliation; resume PDF is supplementary prose. Build step 3 should diff the two and surface conflicts rather than silently merging.

**Seed STAR stories (derive the in-context hot-path set from real experience):**
- Cornerstone: building MCP servers + FastAPI/SSE for real-time AI-agent ↔ enterprise comms.
- Quadeye: SVN+GitLab review agent (latency win), server-janitor (S3 ETag/MD5 safe deletes), Next.js dashboard perf optimization.
- Navi: voice-bot response-quality + latency optimization (great narrative for *this* project).
- Bosch: multimodal RAG + LoRA fine-tuning (blip-2, idefics-9b).
- Real-time Speech Translator project: WebSocket + Web Audio API (directly demonstrates real-time voice skills).
- Logistics answers sourced from JSON: CTC (30 LPA), notice/work-auth (Indian citizen, no sponsorship), references.

**Guardrails:** system prompt forbids fabricating experience/credentials. Unknown → honest graceful answer ("I haven't worked with X directly, but the closest is…") and an on-screen flag in the monitor view.

---

## Component 4 — Tools (minimal + latency-optimized)

Per your feedback, only tools that must run *during* the call exist; anything recoverable from the transcript is dropped (`log_question`, `save_followup` removed).

| Tool | Purpose |
|---|---|
| `lookup_background(query)` | Fast RAG over your KB (pgvector) for long-tail facts |
| `get_company_role_info(topic)` | Pre-loaded company/role research (optional live web search) |
| `flag_for_human(reason)` | Surfaces an on-screen alert in the monitor view (no audio impact) |

**Tool latency budget & optimizations (target <400ms server time):**
- **DB locality:** Neon region pinned to the same region as the Vercel Function; Fluid Compute keeps instances warm (fewer cold starts).
- **Index:** pgvector **HNSW** index; small **top-k (3–4)**; return concise snippets only (trim tokens so the model can speak sooner).
- **Embedding cache:** cache query embeddings; reuse the same embedding model/client across invocations.
- **Pre-warm:** keep a warm function + open DB pool; first lookup of a session pays no cold cost.
- **Speech overlap:** model emits a filler phrase while the tool runs, so perceived latency ≈ 0.
- **Scope `get_company_role_info` to pre-loaded data by default** (deterministic, fast); web search only when explicitly needed.

---

## Component 5 — High-Quality Transcript (foundation for analysis)

Because all post-session value (analysis, action items) comes from the transcript, transcript quality is a first-class requirement:

- **Both sides transcribed:** enable Realtime **input audio transcription** (high-accuracy model, e.g. `gpt-4o-transcribe`/whisper-class) for the interviewer's audio; capture the agent's own output text directly from the Realtime event stream (already exact).
- **Structured capture:** store per-turn rows with `speaker`, `text`, `start/end timestamps`, and any `tool_calls` — not a flat blob.
- **Audio archive for re-transcription:** optionally record the session audio to **Vercel Blob** so a higher-accuracy **offline re-transcription + diarization** pass can run post-call when live latency no longer matters → maximum transcript fidelity.
- **Disfluency handling:** keep a raw transcript plus a lightly cleaned version (the analysis step can normalize filler words) so nothing is lost.

---

## Component 6 — Post-Session Self-Improvement Loop ⭐

After each session:

1. **Capture:** high-quality transcript + tool-call log saved to `transcript_turns` / `sessions`, tagged with the **exact prompt version** used.
2. **Coach/Optimizer agent** (Claude via Vercel AI SDK, `/api/analyze`, runs on a Vercel Function; manual or Cron-triggered). Inputs: transcript, current system prompt, tool traces, your rating + notes, outcome. Outputs **structured JSON**:
   - **Critique** — weak/slow/off-tone answers, stalls, hallucinations.
   - **Prompt patch** — concrete diff to the system prompt (tone, brevity, framing, guardrails).
   - **Knowledge gaps** — questions it couldn't answer → suggested new KB entries / STAR stories.
   - **Action items** — follow-ups/commitments extracted from the transcript (replaces the dropped `save_followup` tool).
   - **Eval cases** — turns the session into regression tests (question → expected-answer rubric).
3. **Versioned prompt registry:** patches create a **new `prompt_versions` row** (never overwrite) → full history + rollback.
4. **Human-in-the-loop apply:** you review/approve a patch before it goes live (prevents prompt drift).
5. **Eval gate (optional, recommended):** before promoting a new version, replay the accumulated `eval_set` through it with an LLM-judge rubric → promote only if no regression.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| UI / framework | **Next.js App Router on Vercel** | Matches your toolchain; API + UI in one repo |
| Real-time voice | **OpenAI Realtime (`gpt-realtime`) over WebRTC** | Lowest-latency speech-to-speech, native barge-in |
| Control plane | Next.js Route Handlers (Vercel Functions, Node 24 / Fluid Compute) | Keys server-side; warm instances cut tool latency |
| Analysis agent | **Vercel AI SDK** + Claude via **AI Gateway** | Structured output, failover, observability |
| Vector + app DB | **Neon Postgres + pgvector** (Marketplace) | RAG + relational data in one store; region-pinned |
| File storage | **Vercel Blob** | Resume/docs + session audio archive |
| Auth | **Clerk** (Marketplace) | Gate the candidate-side app; interviewer link is token-scoped |
| Realtime client | `@openai/agents-realtime` (or raw WebRTC) | SDP/offer-answer + tool wiring |

---

## Data Model (sketch)

- `kb_chunks(id, source, content, embedding vector)` — RAG (HNSW index).
- `prompt_versions(id, version, system_prompt, changelog, active, created_at)`.
- `sessions(id, prompt_version_id, share_token, started_at, ended_at, rating, notes, outcome, audio_blob_url)`.
- `transcript_turns(id, session_id, speaker, text, start_ts, end_ts, tool_calls jsonb)`.
- `eval_set(id, question, rubric, source_session_id)`.

---

## Build Phases (do NOT start until I say so)

1. **Skeleton + token mint:** Next.js app, `/api/session` (create link + ephemeral token), WebRTC connect, two-way audio with a generic voice. Verify latency feels live.
2. **Interviewer link UI:** `/interview/<token>` page (mic permission, connect, end). Optional `/monitor/<session>` read-only captions + takeover.
3. **Grounding:** **first reconcile `profile.json` vs `rithwik_resume.pdf`** (diff + resolve conflicts above, JSON = source of truth); then resume PDF → Blob → chunk/embed → pgvector; load reconciled JSON + seed STAR stories into hot path; `lookup_background` tool.
4. **Tools + guardrails + latency tuning:** `flag_for_human`, company-info tool, anti-fabrication prompt, HNSW index, region pinning, filler-phrase config; measure tool round-trip.
5. **Transcript quality:** input transcription on, structured per-turn capture, optional audio archive + offline re-transcription pass.
6. **Self-improvement loop:** `/api/analyze` coach agent → critique + prompt patch + KB gaps + action items + eval cases; prompt-version registry UI with approve/rollback.
7. **Eval gate (optional):** replay `eval_set` against candidate prompt before promotion.

---

## Verification

- **Latency:** mic-stop → first agent audio <800ms; tool round-trip <400ms server time and hidden behind filler speech.
- **Call path:** open the interviewer link on a second device, grant mic, hold a full back-and-forth; confirm clean two-way audio with no relay.
- **Grounding:** resume questions answered correctly; unknown → honest answer + monitor flag (no fabrication).
- **Transcript quality:** both speakers captured with correct attribution + timestamps; spot-check accuracy vs audio; verify optional offline re-transcription improves fidelity.
- **Improvement loop:** run a mock session, trigger `/api/analyze`, confirm critique + prompt diff + KB gaps + action items + eval cases; approve a patch, confirm next session loads the new version; confirm rollback.

---

## Open Items / Risks

- **Cost:** Realtime audio is priced per audio minute — add a session timer/cap.
- **Interviewer-side variability:** mic quality/network on the interviewer's device affects input transcription — the offline re-transcription pass mitigates this for analysis.
- **Latency spikes on tool calls** — mitigated by warm functions, small top-k, region pinning, and filler phrases.

// Technical deep-dive knowledge base — the material the agent uses to answer
// DEEP technical follow-ups about Rithwik's work and projects.
//
// HOW TO USE THIS FILE (Rithwik):
//   - Each entry is loaded verbatim into the agent's context every session.
//   - Fill in / correct anything marked [VERIFY] with your real specifics
//     (exact numbers, library versions, design choices, gotchas). The more
//     concrete detail you add here, the deeper and more accurate the agent can go.
//   - Lines marked [VERIFY] are implementation specifics I could NOT know — the
//     agent is instructed to treat them as "not yet confirmed" and answer at a
//     principled level + flag, rather than state them as hard fact. Once you
//     replace them with real details (and remove the [VERIFY] tag), the agent
//     will speak them confidently.
//   - Add new entries freely; the loader picks up everything in the array.

export interface DeepDive {
  id: string;
  title: string;
  context: string; // role / org / project
  /** markdown-ish freeform; loaded as-is into the prompt */
  content: string;
}

export const deepDives: DeepDive[] = [
  {
    id: "cornerstone-mcp",
    title: "MCP servers + FastAPI/SSE integration layer",
    context: "AI Engineer @ Cornerstone OnDemand (current)",
    content: `
WHAT IT IS
- Building Model Context Protocol (MCP) servers that expose enterprise tools/services to AI models in a standardized way, plus scalable FastAPI backends using Server-Sent Events (SSE) for real-time streaming between AI agents and internal systems.

MCP — GENERAL (safe to explain)
- MCP is an open protocol that standardizes how LLM applications connect to tools, data, and prompts. A server advertises "tools" (callable functions with JSON schemas), "resources" (readable data), and "prompts". Clients (the model host) discover these and call them. It decouples tool providers from model hosts so the same tool works across agents.
- Transports: stdio for local, and HTTP/SSE (or streamable HTTP) for remote servers.

HOW I USE IT HERE
- I implement MCP servers that wrap internal enterprise services as tools so AI models can call them safely and uniformly.
- For streaming responses back to clients I use FastAPI with SSE (text/event-stream): the server yields incremental events over a long-lived HTTP connection, which is simpler than WebSockets for one-way server→client token/event streaming.

KEY DECISIONS / TRADEOFFS
- SSE vs WebSocket: chose SSE for server→client streaming because it's one-directional, works over plain HTTP, auto-reconnects, and is lighter to operate. Agent progress/updates are streamed directly to the UI via SSE so the user sees incremental results in real time without polling.
- Tool granularity & schemas: tools are scoped per action/endpoint (fine-grained, single-responsibility) so models get precise control. Auth between the MCP server and enterprise services uses OAuth — the server handles token acquisition/refresh and the model never sees credentials directly.

LIKELY FOLLOW-UPS
- "How does auth work between the agent and enterprise tools?" → OAuth — the MCP server handles token exchange with enterprise services; the agent calls the tool and the server injects auth transparently so the model never touches credentials.
- "How do you handle long-running tool calls / backpressure over SSE?" → Long-running tool calls are offloaded to a VM; the SSE connection stays open and the VM streams incremental progress events back to the client as the task runs, so there's no timeout issue on the HTTP layer.
- "Why MCP instead of plain REST tool wrappers?" → standardization, discovery, reuse across agents/hosts.
`.trim(),
  },
  {
    id: "quadeye-review-agent",
    title: "SVN + GitLab code-review agent (latency optimization)",
    context: "Software Developer @ Quadeye Securities",
    content: `
WHAT IT IS
- A software-engineering-heavy project (the AI layer is a lightweight Claude skill; the bulk of the work is systems/orchestration code) that automates the code-review workflow across BOTH SVN and GitLab: fetches incoming review requests/PRs, validates them, and manages them through the review lifecycle. Optimized specifically for SVN repos to cut review latency.

HOW IT WORKS
- Polls/receives incoming review requests from GitLab (MRs) and SVN.
- The latency win came from combining sparse checkout (only the affected paths), revision pinning (fetching only the exact base revision needed), and local cache reuse (reusing previously checked-out bases) with depth-limited fetches — instead of a full expensive checkout per review, the system pulls the minimal data required.

KEY DECISIONS / TRADEOFFS
- SVN is centralized (no cheap local history like git), so naive per-review full checkouts are slow; the multi-strategy optimization (sparse + pinned revision + cache + depth-limited) avoids redundant data transfer — noticeably faster in practice, no formal benchmark numbers.
- Unified handling across two VCS systems: both SVN and GitLab backends implement the same abstract interface so the review workflow is VCS-agnostic — adding a new VCS means implementing the interface, not touching workflow logic.

LIKELY FOLLOW-UPS
- "What was the bottleneck before?" → repeated full SVN checkouts per review — SVN has no cheap local history so every review triggered a fresh full fetch of the base revision.
- "How did you measure the improvement?" → Qualitatively obvious — review jobs that previously stalled waiting on checkout were starting and completing significantly faster; no formal before/after numbers were recorded.
- "How do you validate a review request?" → Schema/format checks (required fields, branch naming conventions) and conflict detection (diff is clean with no unresolvable conflicts before routing for review).
`.trim(),
  },
  {
    id: "quadeye-server-janitor",
    title: "Server janitor — safe obsolete-file cleanup with S3 verification",
    context: "Software Developer @ Quadeye Securities",
    content: `
WHAT IT IS
- A cron job that reclaims disk space on the boxes where quant strategies run. Quant strategies generate files over time that pile up on local disks; the janitor clears them safely so the boxes don't run out of space and impact live trading.

HOW IT WORKS
- Discovery: uses 'lfs find' for efficient file discovery across large filesystems.
- For each file found, two-path logic using ETag as an MD5 hash to verify identity:
  1. File exists in S3 AND the ETag (MD5) matches the local file → confirmed identical copy, safe to delete from disk.
  2. File NOT in S3 (or ETag mismatch) → upload to S3 first, then delete from disk.
- Either way, nothing is permanently lost — every file is verified or uploaded to S3 before local deletion.
- ETag nuance: for single-part S3 uploads the ETag is a straight MD5 of the object, so disk-MD5 == S3-ETag confirms identity. For multipart uploads the ETag format differs (MD5 of part-MD5s with a -N suffix), so the comparison accounts for that.

KEY DECISIONS / TRADEOFFS
- Upload-then-delete (never delete-then-upload) is the safe order: worst case is a redundant upload, never data loss.
- Running as a cron job keeps it simple — no daemon, no event triggers; periodic cleanup is sufficient.
- 'lfs find' chosen for efficiency on large directory trees.

LIKELY FOLLOW-UPS
- "Why not just delete files directly?" → Quant strategy output has analytical value; S3 is the permanent store. The boxes are compute nodes, not storage.
- "What if the S3 upload fails?" → The local file is not deleted — the cron runs again next cycle and retries.
- "How do you know a file is already in S3?" → Check for the object's existence by key; if it's there, skip upload and go straight to delete.
`.trim(),
  },
  {
    id: "quadeye-dashboards",
    title: "Next.js trading/monitoring dashboard performance",
    context: "Software Developer @ Quadeye Securities",
    content: `
WHAT IT IS
- Optimized internal Next.js web dashboards used for trading and monitoring: improved rendering performance, API data-fetching patterns and component efficiency to cut page-load times and improve responsiveness.

TECHNIQUES USED
- Rendering: React.memo / useMemo / useCallback to eliminate unnecessary re-renders; virtualization for large trading data tables and lists.
- Data fetching: batched and deduped API requests, client and server-side caching, moved heavy data fetching server-side, pagination for large datasets.
- Bundle: code splitting and lazy loading to reduce upfront JS.

KEY DECISIONS / TRADEOFFS
- All three layers (render, network, bundle) contributed — trading dashboards are data-dense and real-time so each had meaningful headroom to improve.
- Profiled with React DevTools Profiler (render hotspots) and the browser network panel (redundant/slow API calls) together — running both in parallel made it easy to tell whether a slowdown was render or network driven.
- Improvement was qualitatively significant (noticeably snappier dashboards, less jank on data updates) without formal before/after numbers recorded.

LIKELY FOLLOW-UPS
- "How did you profile it?" → React DevTools Profiler for component render costs + browser network panel for API patterns — using both together let us quickly triage whether a slowdown was render or network.
- "Biggest single win?" → Virtualization on the heavy data tables (trading data with many rows was the worst render offender) and moving data fetching server-side to eliminate client-side waterfall requests.
`.trim(),
  },
  {
    id: "navi-voicebot",
    title: "Voice-bot response quality + latency optimization",
    context: "AI Scientist @ Navi (fintech)",
    content: `
WHAT IT IS
- Led improvements to a customer-facing voice bot: better response quality (via prompt engineering) and lower latency. Conducted a structured latency analysis comparing two architectures.

LATENCY ANALYSIS — KEY FINDING
- Compared two approaches head-to-head:
  1. STT → LLM → TTS pipeline: three serialized hops, latency accumulates across transcription + inference + synthesis + network.
  2. Speech-to-speech (OpenAI): end-to-end model handles the full audio-in/audio-out loop in one pass.
- Conclusion: speech-to-speech (OpenAI) was the lowest-latency option — eliminating two model boundaries and their serialization overhead beats optimizing individual pipeline stages.

LATENCY LEVERS IN A VOICE PIPELINE (explain knowledgeably)
- A classic STT→LLM→TTS pipeline serializes three hops; latency = sum of each + network.
- Reductions: streaming STT (partial transcripts), streaming LLM tokens, streaming TTS (start speaking before full text), smaller/faster models or distillation, prompt compression, caching common responses, speculative/early responses, and good turn-detection (VAD) so you don't wait too long after the user stops.

QUALITY LEVERS
- Prompt engineering: clearer role/format constraints, few-shot examples, grounding, guardrails against hallucination, concise spoken-style output.
- Used hooks in the voice agent to inject dynamic behaviour at specific points in the conversation — for example, a hook on an intent trigger (e.g. user asks about their loan balance) fires before the LLM response, fetches the live account data from the backend, and injects it into the prompt context so the model answers with real values rather than hallucinating or saying it doesn't know. Hooks keep the agent stateless while allowing it to act on real-time data at the right moment.

LIKELY FOLLOW-UPS
- "Why speech-to-speech over a tuned pipeline?" → Fewer hops = lower floor on latency. Even a well-optimized three-stage pipeline has irreducible serialization overhead that speech-to-speech avoids entirely.
- "What are the trade-offs of speech-to-speech?" → Less control over intermediate steps (can't swap TTS voice independently), harder to debug, and the model must handle prosody + content together.
- "What are hooks in the voice agent?" → Event callbacks that fire at defined points in the conversation lifecycle (e.g., on user turn end, on intent detected, on tool call). Used them to fetch live data and inject it into context just-in-time, keeping latency low by only hitting the backend when actually needed.
`.trim(),
  },
  {
    id: "bosch-multimodal-rag",
    title: "Multimodal RAG + LoRA fine-tuning (blip-2, idefics-9b)",
    context: "AI/ML Intern @ Bosch Global Software Technologies",
    content: `
WHAT IT IS
- Engineered multimodal Retrieval-Augmented Generation for image-based outputs, and fine-tuned vision-language models (blip-2, idefics-9b) using LoRA on custom datasets with PyTorch.

CONCEPTS (safe to explain in depth)
- Multimodal RAG: retrieve relevant context (text and/or images) and condition a vision-language model on it to ground generation.
- BLIP-2: bridges a frozen image encoder and a frozen LLM via a lightweight Q-Former; efficient because most weights stay frozen.
- IDEFICS-9B: an open multimodal model (Flamingo-style) that interleaves image and text.
- LoRA: parameter-efficient fine-tuning — freeze base weights, train low-rank adapter matrices (A·B) injected into attention/MLP layers; far fewer trainable params, lower memory, easy to swap adapters.

WHAT I DID
- Indexing strategy: mapped each image to a text summary (generated by the vision-language model), then indexed those summaries in a vector DB. Retrieval operates purely on text embeddings of the summaries — no raw image vectors — which keeps the retrieval stage lightweight and compatible with standard embedding models.
- LoRA fine-tuning on BLIP-2 / IDEFICS-9B: fine-tuned specifically to generate higher-quality, more relevant image summaries. Better summaries → better retrieval → better grounded responses from the full pipeline. Observed quality improvement in end responses after fine-tuning. Used BLEU score to measure summary quality before/after fine-tuning.
- Evaluation: used an LLM-as-judge to verify the end-to-end pipeline output — the judge scores whether the generated response is grounded in the retrieved context and correctly addresses the query. BLEU also applied as an automated metric on generated summaries.

LIKELY FOLLOW-UPS
- "Why LoRA over full fine-tuning?" → Memory/compute efficiency, modular adapters, less overfitting on small datasets — BLIP-2 and IDEFICS are large; full fine-tuning would be prohibitive.
- "Why index summaries instead of image embeddings directly?" → Text embeddings are mature, fast, and work with any standard vector DB; image embeddings require multimodal retrievers and are harder to inspect/debug. Summaries also make retrieval results human-readable.
- "How did you evaluate the pipeline quality?" → LLM-as-judge for end-to-end response grounding; BLEU score on generated summaries to track fine-tuning impact.
- "How was retrieval done for images?" → Images → VLM-generated text summaries → embedded and stored in vector DB → similarity search at query time returns the relevant summaries, which are then passed as context to the generation model.
`.trim(),
  },
  {
    id: "speech-translator",
    title: "Real-time Speech Translator (personal project)",
    context: "Project — realtime-speech-translator.netlify.app",
    content: `
WHAT IT IS
- Full-stack real-time speech translator for cross-language communication. WebSocket connections for real-time transport; Web Audio API for audio capture/processing.

HOW IT WORKS
- Capture: mic audio captured via the Web Audio API using an AudioWorklet (chosen over the deprecated ScriptProcessorNode because it runs off the main thread, avoiding UI-jank and audio glitches), downsampled to 16kHz mono PCM and buffered into short ~250ms chunks.
- Transport: chunks streamed continuously to the backend over a single WebSocket (bidirectional), rather than per-utterance HTTP requests.
- Backend pipeline: Whisper for speech-to-text, an LLM (GPT) for translation (context-aware translation reads better than a phrase-level MT API), and a TTS step to synthesize the translated audio, which is streamed back over the same WebSocket.
- Playback: returned audio is scheduled and played through the Web Audio API on the client.

KEY DECISIONS / TRADEOFFS
- WebSocket over plain HTTP: one persistent connection for continuous bidirectional audio streaming — avoids per-request connection/overhead and enables incremental results.
- AudioWorklet over ScriptProcessor: off-main-thread processing for glitch-free capture.
- LLM translation over a dedicated MT API: better handling of context/idiom, at the cost of slightly higher latency than a phrase-level translator.
- Utterance segmentation via silence/energy-based VAD: continuous speech is split into segments on detected pauses, and each completed segment is pushed through the STT→translate→TTS pipeline — so the system handles continuous speech rather than requiring fixed turns.
- Latency: kept low by chunked streaming + persistent WebSocket; perceived end-to-end latency is roughly a second or two per utterance, dominated by the STT and translation steps (qualitative — no formal benchmark recorded).

LIKELY FOLLOW-UPS
- "How did you keep latency low?" → chunked ~250ms audio over a persistent WebSocket, off-main-thread capture (AudioWorklet), and processing per-utterance segment instead of waiting for the speaker to fully stop.
- "How do you handle overlapping/continuous speech?" → silence/energy-based VAD segments the stream into utterances; each segment is pipelined independently.
- "Why Whisper + an LLM rather than one speech-to-speech model?" → at the time this was the practical, controllable stack; today a speech-to-speech model (like in my Navi work) would cut latency further.
- Note: this project is strong proof of hands-on real-time browser audio + streaming skills.
`.trim(),
  },
  {
    id: "auto-analyst",
    title: "Auto-Analyst — LangGraph multi-agent data analyst",
    context: "Project (Aug 2024)",
    content: `
WHAT IT IS
- Automates data-analyst tasks using a LangGraph-based multi-agent architecture: SQL querying, dynamic visualizations, and financial forecasting.

CONCEPTS (safe to explain)
- LangGraph: a framework for building stateful, multi-agent LLM workflows as graphs (nodes = steps/agents, edges = control flow, shared state object). Good for cyclic/branching agent logic with explicit state.

ARCHITECTURE
- A router/supervisor node first classifies the natural-language request and routes it, via conditional edges, to the right specialist node. Shared graph state carries the user query, the retrieved data, and each node's output.
- SQL agent: translates the question to SQL, runs it against the database (SQLite for the project; the approach generalizes to Postgres), and returns the result rows into shared state.
- Visualization agent: inspects the shape of the returned data and picks an appropriate chart, generating it with matplotlib/Plotly.
- Forecasting agent: runs time-series forecasting with Facebook Prophet (handles trend + seasonality with minimal tuning; ARIMA was the considered alternative) on the queried series.
- A final response node aggregates the outputs (table / chart / forecast) into the answer.

SAFETY
- The SQL agent is constrained to read-only: generated SQL is validated and anything other than SELECT (INSERT/UPDATE/DELETE/DROP/DDL) is rejected, and it runs over a read-only connection. The schema is injected into the prompt so generated queries are valid against the real tables.

LIKELY FOLLOW-UPS
- "How do you prevent bad/destructive SQL?" → SELECT-only validation + read-only DB connection + schema-grounded generation; non-read statements are rejected before execution.
- "Why LangGraph over a simple chain?" → branching/conditional routing to specialist agents, explicit shared state across steps, and the ability to loop/retry — a linear chain can't express the route-by-intent control flow cleanly.
- "Why Prophet for forecasting?" → strong out-of-the-box handling of trend and seasonality with little tuning, which suits an automated agent; tracked forecast error with MAPE on held-out data.
- "How accurate was forecasting?" → evaluated with MAPE on a held-out tail of each series; good enough for directional financial forecasting on the datasets tested (qualitative — a small personal project, not production-tuned).
`.trim(),
  },
];

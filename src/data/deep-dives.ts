// Technical deep-dive knowledge base - the material the agent uses to answer
// DEEP technical follow-ups about Rithwik's work and projects.
//
// HOW TO USE THIS FILE (Rithwik):
//   - Each entry is loaded verbatim into the agent's context every session.
//   - Fill in / correct anything marked [VERIFY] with your real specifics
//     (exact numbers, library versions, design choices, gotchas). The more
//     concrete detail you add here, the deeper and more accurate the agent can go.
//   - Lines marked [VERIFY] are implementation specifics I could NOT know - the
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
    id: "avoca-voice-agents",
    title: "Production voice AI agents with CRM integrations",
    context: "AI Engineer @ Avoca (YC W23) - current",
    content: `
WHAT IT IS
- Designing, developing, and deploying production voice AI agents using VAPI and ElevenLabs.
- The agents integrate LLM-powered conversational workflows with customer CRM systems and downstream business workflows.

HOW IT WORKS
- Voice layer: VAPI handles the voice-agent runtime, telephony/conversation orchestration, and low-latency interaction loop; ElevenLabs is used for high-quality speech output.
- Tool layer: custom MCP servers and REST-backed tools expose CRM actions and contextual business data to the voice agents.
- Retrieval/context: RAG and ML models provide real-time contextual access so the agent can answer or act using business-specific data rather than generic prompt knowledge.
- Workflow layer: downstream CRM and business-system calls are wrapped behind typed tool boundaries so the agent can perform actions without directly handling credentials or raw integration complexity.

AGENT-TO-AGENT SIMULATION
- Built an automated agent-to-agent voice simulation framework using an outbound LLM.
- The simulator stress-tests conversational flows, probes edge cases, and reduces manual QA effort before production release.
- This helps catch failures like bad turn-taking, missing tool arguments, weak fallback behavior, and brittle intent handling before real users hit them.

TESTING / CI-CD
- Developed CI/CD test suites for the customer-facing dashboard, including unit and component tests.
- The goal was to improve release reliability and prevent regressions across production releases.

KEY DECISIONS / TRADEOFFS
- Keep integration logic out of the prompt: tools/MCP servers own the CRM and workflow details, while the model decides when to call them.
- Prefer simulation plus evals over manual call-by-call QA because voice agents have many conversational branches and edge cases.
- Use RAG/tools for live business context instead of baking customer-specific data into static prompts.

LIKELY FOLLOW-UPS
- "How do you keep production voice agents reliable?" -> typed tools, clear fallback behavior, simulation, LLM evals, and CI checks around the dashboard/workflows.
- "Why MCP for voice agents?" -> it standardizes how agents discover and call business tools, making integrations reusable and safer than ad hoc prompt-only access.
- "How do you test a voice agent?" -> simulate callers with an outbound LLM, run scenario suites, inspect transcripts/tool calls, and turn failures into prompt/tool/eval fixes.
- "How do you avoid hallucinating CRM data?" -> retrieve or call tools for live business data; if the data is unavailable, the agent should say so rather than guess.
`.trim(),
  },
  {
    id: "elyx-mobile-healthtech",
    title: "Digital health platform features and mobile E2E testing",
    context: "AI Engineer Intern @ Elyx Life (Healthtech)",
    content: `
WHAT IT IS
- Owned features end to end on a digital health platform, from requirements through production release, across cross-platform iOS/Android applications.
- Built automated end-to-end mobile test flows using Maestro for iOS and Android.

HOW IT WORKS
- Worked across the product lifecycle: clarify requirements, implement app/platform changes, test critical flows, and support release readiness.
- Maestro tests covered critical user journeys so regressions could be caught before mobile releases.
- The work was healthcare-product focused: reliability and user journey correctness mattered because the platform was used for health-related workflows.

KEY DECISIONS / TRADEOFFS
- E2E mobile flows complement unit tests because many mobile failures happen across navigation, state, permissions, backend calls, and device-specific behavior.
- Maestro is useful for cross-platform mobile automation because tests can express user-level flows across iOS and Android without rewriting everything twice.

LIKELY FOLLOW-UPS
- "What did you own end to end?" -> requirements, implementation, testing, and release support for digital health platform features.
- "Why Maestro?" -> it is lightweight for mobile E2E flows and good for validating critical cross-platform journeys.
- "What was the healthcare angle?" -> digital health platform work; be careful not to claim clinical modeling or deep medical AI unless source data is added.
`.trim(),
  },
  {
    id: "salescode-voice-agents",
    title: "Conversational AI voice agents with LiveKit, Dify, SIP, and evals",
    context: "AI Intern @ Salescode.ai",
    content: `
WHAT IT IS
- Built production conversational AI voice agents using LiveKit and Dify.
- Integrated agents with SIP providers such as Twilio for real-time telephony.
- Designed LLM evaluation and testing frameworks with Opik and Langfuse.

HOW IT WORKS
- LiveKit provides the real-time media layer for audio rooms/streams.
- SIP/Twilio integration connects the agent workflow to phone calls.
- Dify is used for building and orchestrating LLM-powered agent workflows.
- Evaluation frameworks track conversational quality, reliability, and regressions before deployment.

AGENT SIMULATIONS
- Built agent-to-agent simulations to stress-test conversational quality and reliability before deployment.
- Simulations are useful for finding edge cases in intent handling, incomplete responses, interruptions, and tool-call behavior.

KEY DECISIONS / TRADEOFFS
- Voice agents need both media reliability and LLM reliability; testing only the prompt is not enough.
- Eval tooling with Opik/Langfuse helps inspect traces, score behavior, and compare changes over time.
- SIP integration brings real telephony constraints: latency, interruptions, audio quality, and call lifecycle handling.

LIKELY FOLLOW-UPS
- "What is LiveKit doing here?" -> real-time audio/media infrastructure for the agent conversation.
- "Why use Opik/Langfuse?" -> observability and evaluations for LLM traces, quality, and regression testing.
- "How do you test before production?" -> agent-to-agent simulations plus eval frameworks over transcripts/traces.
`.trim(),
  },
  {
    id: "bosch-multimodal-rag",
    title: "Multimodal RAG + LoRA fine-tuning",
    context: "AI/ML Intern @ Bosch Global Software Technologies",
    content: `
WHAT IT IS
- Built multimodal RAG pipelines for image understanding, covering retrieval design through evaluation.
- Fine-tuned large vision-language models using PyTorch and LoRA on custom datasets.

CONCEPTS (safe to explain in depth)
- Multimodal RAG: retrieve relevant context from image/text assets and condition a vision-language model on it to ground generation.
- LoRA: parameter-efficient fine-tuning that freezes base model weights and trains low-rank adapter matrices, making adaptation cheaper and less memory intensive than full fine-tuning.
- Vision-language evaluation should check both answer quality and grounding in the retrieved image/context.

WHAT I DID
- Designed retrieval flow for image-understanding use cases.
- Fine-tuned large vision-language models with PyTorch and LoRA on custom datasets.
- Evaluated model performance for real-world deployment suitability.

LIKELY FOLLOW-UPS
- "Why LoRA over full fine-tuning?" -> far lower compute/memory cost, modular adapters, and lower overfitting risk on smaller custom datasets.
- "How do you evaluate multimodal RAG?" -> check retrieval relevance, groundedness of generated answers, and task-specific quality metrics.
- "What was the deployment concern?" -> whether model quality and reliability were strong enough for real-world use, not just offline demos.
`.trim(),
  },
  {
    id: "speech-translator",
    title: "Real-time Speech Translator",
    context: "Project - realtime-speech-translator.netlify.app",
    content: `
WHAT IT IS
- Full-stack real-time speech translation platform using WebSockets for low-latency, production-grade communication.
- Implemented streaming audio processing with the Web Audio API and scalable backend services.

HOW IT WORKS
- Capture: browser microphone audio is processed through the Web Audio API.
- Transport: audio chunks stream over persistent WebSocket connections to avoid per-request overhead and support low-latency bidirectional communication.
- Backend: scalable services process audio and translation work, then return results to the client.

KEY DECISIONS / TRADEOFFS
- WebSocket over request/response HTTP: persistent bidirectional transport is better for continuous audio.
- Streaming audio instead of waiting for a full recording improves perceived latency.
- Browser audio work requires careful buffering and playback scheduling to avoid glitches.

LIKELY FOLLOW-UPS
- "How did you keep latency low?" -> persistent WebSockets, streaming chunks, and browser-side Web Audio processing.
- "Why WebSockets?" -> continuous bidirectional communication with lower overhead than repeated HTTP calls.
- "What does this prove?" -> hands-on real-time browser audio, streaming, and backend systems experience.
`.trim(),
  },
  {
    id: "elyx-voice-interview-agent",
    title: "AI Interview Voice Agent (self-improving)",
    context: "Personal Project - elyx-sigma.vercel.app",
    content: `
WHAT IT IS
- A real-time voice agent that attends job interviews on my behalf, answering questions in first person using my actual resume, STAR stories, personal Q&A, and technical deep dives.
- Built end to end: WebRTC audio, OpenAI Realtime API, post-call coach analysis, and versioned prompt management.

TECH STACK
- Frontend: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4.
- Realtime: OpenAI Realtime API, WebRTC for audio transport, Web Speech API for live interviewer captions.
- Coach agent: Vercel AI SDK generateObject, structured Zod output, OpenAI analysis model.
- Storage: local file store in dev or Neon Postgres when DATABASE_URL is set.

HOW THE LIVE INTERVIEW WORKS
- Browser calls /api/session; the server builds instructions from the active prompt, profile, stories, personal answers, deep dives, and optional job description.
- Server mints an ephemeral OpenAI Realtime token so the browser never sees the real API key or the full source-of-truth data.
- Browser opens a WebRTC connection directly to OpenAI. Audio does not relay through the Next.js server.
- The agent has a silent flag_uncertain tool used to log missing/uncertain knowledge for later review.
- Transcript and tool events are autosaved during the call and saved again when the interview ends.

SELF-IMPROVEMENT LOOP
- /review sends the transcript plus the exact source-of-truth context to an analysis model.
- The coach checks grounding, persona, repetition, directness, concision, contradictions, and prompt leakage.
- It returns ungrounded claims, unanswered questions, knowledge gaps, eval cases, and a minimal proposed prompt patch.
- Prompt versions are immutable and can be applied or rolled back.

KEY DECISIONS / TRADEOFFS
- WebRTC direct keeps latency lower than server-relayed audio.
- Full context loading is simpler and faster than RAG because the profile is small enough to fit in context.
- The uncertainty tool does not fetch outside data; it logs gaps so they can be reviewed and added later.

LIKELY FOLLOW-UPS
- "How do you keep it grounded?" -> source-of-truth context, anti-fabrication instructions, flag_uncertain, and post-call grounding analysis.
- "Why no RAG?" -> profile is small enough to load fully; retrieval would add latency and complexity for little benefit.
- "What would you add next?" -> actual retrieval or CRM-style tools if the knowledge base grows beyond prompt context, plus automated evals before prompt promotion.
`.trim(),
  },
  {
    id: "auto-analyst",
    title: "Auto-Analyst - LangGraph multi-agent data analyst",
    context: "Project (Aug 2024)",
    content: `
WHAT IT IS
- Automated analytics platform integrating SQL querying against relational databases, financial forecasting, and interactive visualizations.
- Designed modular backend workflows for reliable, production-style data processing.

CONCEPTS (safe to explain)
- LangGraph: a framework for stateful, multi-agent LLM workflows as graphs, where nodes are steps/agents and edges control routing.
- A data analyst agent typically needs schema-aware SQL generation, safe execution, visualization selection, and response synthesis.

ARCHITECTURE
- Router/supervisor classifies the user request and sends it to the right specialist workflow.
- SQL workflow generates read-only SQL against a relational database and returns result rows.
- Visualization workflow inspects data shape and produces appropriate charts.
- Forecasting workflow handles time-series style prediction for financial data.

SAFETY
- SQL should be constrained to read-only statements, validated before execution, and generated with the real schema in context.
- Modular workflows make it easier to test and replace pieces independently.

LIKELY FOLLOW-UPS
- "How do you prevent destructive SQL?" -> SELECT-only validation, read-only DB connection, and schema-grounded generation.
- "Why LangGraph?" -> routing, branching, explicit state, and multi-step workflows are cleaner as a graph than a linear chain.
- "What made it production-style?" -> modular backend workflows, reliable data processing boundaries, and explicit validation.
`.trim(),
  },
];

// Server-side builder for the OpenAI Realtime session configuration.
// This shape is posted to /v1/realtime/client_secrets so the prompt, tools and
// transcription settings are bound to the ephemeral token (never exposed to the client).

export const REALTIME_MODEL = process.env.REALTIME_MODEL ?? "gpt-realtime";
export const REALTIME_VOICE = process.env.REALTIME_VOICE ?? "marin";
export const TRANSCRIBE_MODEL =
  process.env.REALTIME_TRANSCRIBE_MODEL ?? "gpt-4o-transcribe";

/** Minimal, latency-friendly tool set. */
export const REALTIME_TOOLS = [
  {
    type: "function",
    name: "flag_uncertain",
    description:
      "REQUIRED: Call this immediately after your spoken response whenever: (1) you were asked about a technology/skill/experience not in the profile, (2) you had to deflect or bridge to something tangentially related, (3) you stated a specific metric, date, or implementation detail not explicitly in your data, or (4) you had any doubt your answer was fully grounded. This call is silent and never interrupts speech. Over-flagging is always preferred over missing a flag.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Short label for what was asked" },
        reason: {
          type: "string",
          description: "Why you were uncertain or what was missing from your knowledge",
        },
      },
      required: ["topic", "reason"],
    },
  },
] as const;

export function buildSessionConfig(instructions: string) {
  return {
    type: "realtime",
    model: REALTIME_MODEL,
    instructions,
    audio: {
      input: {
        transcription: { model: TRANSCRIBE_MODEL, language: "en" },
        // Semantic VAD waits for the interviewer to finish a thought instead of
        // triggering on every silence — more natural turn-taking.
        turn_detection: { type: "semantic_vad" },
      },
      output: {
        voice: REALTIME_VOICE,
      },
    },
    tools: REALTIME_TOOLS,
    tool_choice: "auto",
  };
}

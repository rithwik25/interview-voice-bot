// Post-session coach agent. Reads a session transcript + the exact prompt version
// used, and produces a structured critique + a concrete prompt patch to improve
// the voice agent. The patch is NOT auto-applied — the user approves it in /review.

import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getSession, saveSession, getPromptVersions } from "@/lib/store";
import type { AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL ?? "gpt-4o";

const schema = z.object({
  summary: z.string().describe("2-3 sentence summary of how the interview went"),
  overallScore: z.number().min(1).max(10),
  strengths: z.array(z.string()),
  weaknesses: z.array(
    z.object({
      issue: z.string(),
      example: z.string().describe("a concrete quote/turn from the transcript"),
      severity: z.enum(["low", "medium", "high"]),
    })
  ),
  promptPatch: z.object({
    rationale: z.string().describe("why these prompt changes will improve the agent"),
    newInstructions: z
      .string()
      .describe(
        "the COMPLETE rewritten base instructions (do not include the profile/STAR data — only the editable instruction text). Keep what works, fix what didn't."
      ),
  }),
  knowledgeGaps: z.array(
    z.object({
      question: z.string().describe("a question the agent struggled with"),
      suggestedAddition: z.string().describe("what to add to the profile/knowledge base"),
    })
  ),
  actionItems: z.array(z.string()).describe("follow-ups/commitments mentioned in the call"),
  evalCases: z.array(
    z.object({
      question: z.string(),
      rubric: z.string().describe("what a good answer must contain"),
    })
  ),
});

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  const { sessionId } = await req.json();
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const versions = await getPromptVersions();
  const usedVersion =
    versions.find((v) => v.version === session.promptVersion) ?? versions[0];

  const transcriptText = session.transcript
    .map((t) => `${t.speaker === "agent" ? "AGENT (as candidate)" : "INTERVIEWER"}: ${t.text}`)
    .join("\n");

  const flagged = session.toolEvents
    .filter((e) => e.name === "flag_uncertain")
    .map((e) => `- ${JSON.stringify(e.args)}`)
    .join("\n");

  const prompt = `You are an expert interview coach AND prompt engineer. You are improving a VOICE AGENT that answers job interviews on behalf of a candidate.

The agent's CURRENT base instructions (the editable part you can rewrite) were:
"""
${usedVersion.instructions}
"""

Here is the full interview transcript:
"""
${transcriptText || "(no transcript captured)"}
"""

The agent self-flagged uncertainty on these topics during the call:
${flagged || "(none)"}

Candidate's own rating (1-5): ${session.rating ?? "n/a"}
Candidate's notes: ${session.notes ?? "n/a"}

Analyze the agent's performance: where answers were weak, slow, off-tone, too long, evasive, or not grounded. Then propose an improved version of the base instructions that fixes those issues while preserving what worked. Extract knowledge gaps (things the agent didn't know about the candidate), any action items/commitments, and a few regression eval cases.`;

  const { object } = await generateObject({
    model: openai(ANALYSIS_MODEL),
    schema,
    prompt,
  });

  const analysis: AnalysisResult = { ...object, analyzedAt: Date.now() };
  await saveSession({ ...session, analysis });

  return NextResponse.json({ analysis });
}

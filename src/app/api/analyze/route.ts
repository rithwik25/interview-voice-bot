// Post-session coach agent. Reads a session transcript + the exact prompt version
// used, and produces a structured critique + a concrete prompt patch to improve
// the voice agent. The patch is NOT auto-applied — the user approves it in /review.

import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getSession, saveSession, getPromptVersions } from "@/lib/store";
import { ANALYSIS_CHECKS, type AnalysisResult, type CheckId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL ?? "gpt-4o";

const checkIds = ANALYSIS_CHECKS.map((c) => c.id) as [CheckId, ...CheckId[]];

const schema = z.object({
  summary: z.string().describe("2-3 sentence summary of how the interview went"),
  overallScore: z.number().min(1).max(10),
  checks: z
    .array(
      z.object({
        id: z.enum(checkIds),
        status: z.enum(["pass", "warn", "fail"]),
        detail: z.string().describe("brief justification, citing the transcript"),
      })
    )
    .describe("Exactly one entry for EACH required check id."),
  ungroundedClaims: z
    .array(
      z.object({
        quote: z.string().describe("the exact thing the agent said"),
        issue: z.string().describe("why it isn't supported by the candidate's data"),
      })
    )
    .describe("Statements the agent made that are NOT backed by the profile/resume/deep-dives/personal answers. Empty if all grounded."),
  unansweredQuestions: z
    .array(
      z.object({
        question: z.string(),
        whatWasMissing: z.string().describe("what data was missing to answer it well"),
      })
    )
    .describe("Questions the agent was asked that the provided data could NOT properly answer — these need human input."),
  needsHumanReview: z
    .boolean()
    .describe("true if there were any ungroundedClaims or unansweredQuestions, or any grounding-related check failed."),
  strengths: z.array(z.string()),
  weaknesses: z.array(
    z.object({
      issue: z.string(),
      example: z.string().describe("a concrete quote/turn from the transcript"),
      severity: z.enum(["low", "medium", "high"]),
    })
  ),
  promptPatch: z.object({
    rationale: z
      .string()
      .describe("briefly summarize the minimal change(s) you made and why"),
    newInstructions: z
      .string()
      .describe(
        "The base instructions with MINIMAL edits. Preserve the existing wording and structure verbatim; change only what is strictly necessary to address the issues/feedback — ideally just adding or tweaking a line or two. Do NOT rewrite, reorder, or restructure the prompt. Return the full instruction text with those minimal edits applied (exclude the profile/STAR/deep-dive data)."
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

  const { sessionId, humanFeedback } = await req.json();
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const feedback = typeof humanFeedback === "string" ? humanFeedback.trim() : "";

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

  const jdBlock = session.jobDescription
    ? `\nThe interview was for this TARGET ROLE / JOB DESCRIPTION:\n"""\n${session.jobDescription}\n"""\nWhere relevant, judge how well the agent tailored answers to this role and tied the candidate's experience to it.\n`
    : "";

  const checklist = ANALYSIS_CHECKS.map((c) => `- ${c.id}: ${c.label}`).join("\n");

  const feedbackBlock = feedback
    ? `\n================ HUMAN REVIEWER FEEDBACK — HIGHEST PRIORITY ================
A human reviewed this interview and gave the following feedback. Treat it as the single MOST IMPORTANT signal in this whole analysis. Your promptPatch MUST directly and explicitly implement this feedback. Where it conflicts with your own judgment, the human feedback WINS. Call out in promptPatch.rationale exactly how you applied it.
"""
${feedback}
"""
`
    : "";

  const prompt = `You are an expert interview coach AND prompt engineer. You are improving a VOICE AGENT that answers job interviews on behalf of a candidate.
${jdBlock}${feedbackBlock}
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

REQUIRED CHECKS — return exactly one entry in "checks" for EACH id below, with status pass/warn/fail and a short evidence-based detail:
${checklist}

GROUNDING IS CRITICAL: the agent must only state things supported by the candidate's profile, resume, deep dives, and personal answers.
- List in "ungroundedClaims" every statement the agent made that is NOT backed by that data (fabricated experience, invented metrics/names, unsupported skills). If all claims are grounded, return an empty array and pass "grounded_in_data".
- List in "unansweredQuestions" any question the agent was asked that the data could not properly answer — these specifically need a human to provide the missing information.
- Set "needsHumanReview" to true if there are any ungroundedClaims or unansweredQuestions, or if grounding failed.

Then: identify strengths and weaknesses (quote the transcript), extract knowledge gaps and action items, and write a few regression eval cases.

Finally, propose a MINIMAL patch to the base instructions ("promptPatch.newInstructions"). Make the smallest change that addresses the failed/warned checks and the issues above — preserve the existing wording and structure, and prefer adding or tweaking just a line or two over rewriting. Do NOT restructure the prompt. ${feedback ? "The HUMAN REVIEWER FEEDBACK above takes top priority and must be implemented (still as a minimal edit)." : ""} Do not include the profile/STAR/deep-dive data in newInstructions — only the editable instruction text.`;

  const { object } = await generateObject({
    model: openai(ANALYSIS_MODEL),
    schema,
    prompt,
  });

  const analysis: AnalysisResult = {
    ...object,
    humanFeedback: feedback || undefined,
    analyzedAt: Date.now(),
  };
  await saveSession({
    ...session,
    analysis,
    notes: feedback || session.notes,
  });

  return NextResponse.json({ analysis });
}

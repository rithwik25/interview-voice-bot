// Post-session coach agent. Reads a session transcript + the exact prompt version
// used, and produces a structured critique + a concrete prompt patch to improve
// the voice agent. The patch is NOT auto-applied — the user approves it in /review.

import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getSession, saveSession, getPromptVersions } from "@/lib/store";
import { buildInstructions } from "@/lib/prompt";
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
    changesRecommended: z
      .boolean()
      .describe(
        "false if the agent performed well and NO prompt change is warranted (all checks pass, no ungrounded claims, no unanswered questions, and no human feedback). true otherwise."
      ),
    rationale: z
      .string()
      .describe(
        "if changesRecommended is false, say the prompt is performing well and needs no change; otherwise briefly summarize the minimal change(s) you made and why"
      ),
    newInstructions: z
      .string()
      .describe(
        "If changesRecommended is false, return the CURRENT base instructions unchanged. Otherwise, the base instructions with MINIMAL edits: preserve the existing wording and structure verbatim and change only what is strictly necessary — ideally just adding or tweaking a line or two. Do NOT rewrite, reorder, or restructure. Exclude the profile/STAR/deep-dive data."
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

  // Build the exact same full context the voice agent had during this session.
  // The coach needs the complete source-of-truth data to accurately cross-reference
  // every claim the agent made — without this it can't catch hallucinations.
  const fullAgentContext = buildInstructions(usedVersion, session.jobDescription);

  const transcriptText = session.transcript
    .map((t) => `${t.speaker === "agent" ? "AGENT (as candidate)" : "INTERVIEWER"}: ${t.text}`)
    .join("\n");

  const flagged = session.toolEvents
    .filter((e) => e.name === "flag_uncertain")
    .map((e) => `- ${JSON.stringify(e.args)}`)
    .join("\n");

  const jdBlock = session.jobDescription
    ? `The interview was tailored to this TARGET ROLE / JOB DESCRIPTION:\n"""\n${session.jobDescription}\n"""\nWhere relevant, judge how well the agent prioritized the most relevant experience and tied answers to this role.\n\n`
    : "";

  const feedbackBlock = feedback
    ? `================ HUMAN REVIEWER FEEDBACK — HIGHEST PRIORITY ================
A human reviewed this interview. Treat this as the single most important signal. Your promptPatch MUST directly implement it. Where it conflicts with your own judgment, the human wins.
"""
${feedback}
"""

`
    : "";

  const checkCriteria = `
REQUIRED CHECKS — evaluate each one and return exactly one entry per id:

grounded_in_data — cross-reference every factual claim the agent made (company names, job titles, dates, technologies used, metrics, project names, skills, achievements) against the SOURCE OF TRUTH above. The agent may ONLY state things explicitly present in that data.
  PASS: every claim is directly traceable to the source of truth
  WARN: one claim is a reasonable inference from the data but not explicitly stated
  FAIL: any specific fact (technology, metric, name, detail) that does not appear in the source of truth at all

polite_and_respectful
  PASS: consistently warm, professional, and respectful throughout
  WARN: one moment that came across as curt, dismissive, or slightly awkward
  FAIL: rude, sarcastic, condescending, or unprofessional at any point

no_excessive_repetition
  PASS: no substantive point repeated more than once unnecessarily
  WARN: the same phrase or idea repeated 2-3 times across the session
  FAIL: same phrase or content repeated 3+ times in a way that would frustrate an interviewer

no_stuck_or_loops
  PASS: conversation flowed naturally with no circular answers
  WARN: one instance where the agent gave a slightly circular or evasive answer
  FAIL: agent clearly got stuck, repeated the same answer when pressed, or looped

stayed_in_persona
  PASS: always spoke as "I" — never "the candidate", "Rithwik", or anything meta
  WARN: one slip into third person or slightly mechanical phrasing that hints at scripting
  FAIL: broke character — referred to itself as an AI, referred to the candidate by name in third person, or revealed it is reading from data

answers_concise
  PASS: most answers are 2-4 spoken sentences; longer only when explicitly asked to go deeper or for a technical deep-dive
  WARN: 1-2 answers that ran noticeably long without the interviewer requesting more detail
  FAIL: consistently rambling, info-dumping, or delivering bullet-list-length monologues

answered_the_question
  PASS: every answer led with a direct response to what was actually asked
  WARN: one answer that pivoted or partially deflected before eventually addressing the question
  FAIL: clear deflection, non-answer, or answer to a different question on something material

professional_about_employers
  PASS: all past employers mentioned neutrally or positively
  WARN: one phrasing that could be read as subtly negative about a past employer
  FAIL: any explicit negative commentary about a past employer or colleague

no_self_contradiction
  PASS: all claims are internally consistent and consistent with the SOURCE OF TRUTH data
  WARN: one minor inconsistency in framing the same fact two different ways
  FAIL: direct contradiction within the session, or a claim that contradicts the source of truth data

no_prompt_or_ai_leak
  PASS: nothing in the conversation hints at AI, instructions, or data sources
  WARN: one answer that sounds slightly too scripted or formulaic
  FAIL: mentioned being an AI, referenced having instructions, said "according to my data", or anything that exposes the system setup
`.trim();

  const prompt = `You are an expert interview coach AND prompt engineer. You are evaluating a VOICE AGENT that answered a job interview on behalf of a candidate.

${jdBlock}${feedbackBlock}================ SOURCE OF TRUTH — the ONLY facts the agent was permitted to draw from ================
This is the complete context the voice agent had during the interview. Every factual claim the agent made must be traceable to something in this block. Use this as your ground truth when evaluating grounding.

${fullAgentContext}

================ END SOURCE OF TRUTH ================

================ INTERVIEW TRANSCRIPT ================
${transcriptText || "(no transcript captured)"}
================ END TRANSCRIPT ================

The agent self-flagged uncertainty on these topics during the call:
${flagged || "(none — note: absence of flags does not mean the agent was always grounded; check independently)"}

Candidate's own rating (1-5): ${session.rating ?? "n/a"}

${checkCriteria}

GROUNDING — this is the most important part of the evaluation:
- Go through the transcript line by line. For every specific factual claim the agent made (a technology, a company, a date, a metric, a project detail, a skill), find the exact line in the SOURCE OF TRUTH that supports it.
- If you cannot find it in the source of truth, add it to ungroundedClaims with a direct quote and explain what is missing.
- Do NOT give the agent the benefit of the doubt on specifics — if it stated a concrete fact that isn't in the data, it's ungrounded.
- For questions where the source of truth genuinely had no good answer (agent had to deflect or bridge), add to unansweredQuestions with what data was missing.
- Set needsHumanReview true if any ungroundedClaims exist, any unansweredQuestions exist, or grounded_in_data failed.

SCORING (overallScore 1-10) — anchor to the checks, do not default to a middling number:
- All checks pass + no ungrounded claims + no unanswered questions → 9 or 10
- Deduct ~1 per warn, ~2-3 per fail or per ungrounded claim
- Only 4-6 if there are genuine substantive weaknesses; a clean interview scores high

Then: identify concrete strengths and weaknesses (quote the transcript), extract knowledge gaps that need to be added to the data files, note any action items, and write regression eval cases.

Finally, decide whether the base instructions need changing. The base instructions are the editable section at the top of the SOURCE OF TRUTH (before the CANDIDATE PROFILE section). If the agent performed well — all checks pass, nothing ungrounded, nothing unanswered${feedback ? "" : ", no human feedback"} — set changesRecommended FALSE and return the current base instructions unchanged. Otherwise set changesRecommended TRUE and make MINIMAL edits to those base instructions only: preserve all existing wording and structure, add or tweak only what is strictly necessary (typically 1-2 lines). Do NOT include the profile/STAR/deep-dive data in newInstructions — those sections are appended automatically. ${feedback ? "The human reviewer feedback above takes top priority and must be implemented." : ""}`;

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

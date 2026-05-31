// Shared types for the voice interview agent.

export type Speaker = "interviewer" | "agent";

export interface TranscriptTurn {
  speaker: Speaker;
  text: string;
  /** epoch ms when the turn was committed */
  ts: number;
}

export interface ToolEvent {
  name: string;
  args: Record<string, unknown>;
  ts: number;
}

export interface SessionRecord {
  id: string;
  promptVersion: number;
  startedAt: number;
  endedAt: number | null;
  /** the job description this interview was tailored to, if provided */
  jobDescription?: string;
  transcript: TranscriptTurn[];
  toolEvents: ToolEvent[];
  /** candidate's own 1-5 rating of how the agent did, set post-call */
  rating?: number;
  notes?: string;
  analysis?: AnalysisResult;
}

export type CheckStatus = "pass" | "warn" | "fail";

/** The fixed set of quality checks the coach agent must evaluate every session. */
export const ANALYSIS_CHECKS = [
  { id: "grounded_in_data", label: "Every claim grounded in resume/data (no hallucination)" },
  { id: "polite_and_respectful", label: "Polite and respectful throughout" },
  { id: "no_excessive_repetition", label: "Didn't repeat the same point more than twice" },
  { id: "no_stuck_or_loops", label: "Never got stuck or stuck in a loop" },
  { id: "stayed_in_persona", label: "Stayed in first person as the candidate" },
  { id: "answers_concise", label: "Answers were concise (spoken length, no rambling)" },
  { id: "answered_the_question", label: "Answered the actual question asked (no dodging)" },
  { id: "professional_about_employers", label: "Stayed professional about past/current employers" },
  { id: "no_self_contradiction", label: "No self-contradiction or inconsistency with the data" },
  { id: "no_prompt_or_ai_leak", label: "Didn't leak the system prompt or that it's an AI/reading notes" },
] as const;

export type CheckId = (typeof ANALYSIS_CHECKS)[number]["id"];

export interface AnalysisCheck {
  id: CheckId;
  status: CheckStatus;
  detail: string;
}

export interface AnalysisResult {
  summary: string;
  overallScore: number; // 1-10
  /** explicit pass/warn/fail on each required quality gate */
  checks: AnalysisCheck[];
  /** statements the agent made that are NOT supported by the candidate's data */
  ungroundedClaims: Array<{ quote: string; issue: string }>;
  /** questions the agent was asked that the data could not answer (need human input) */
  unansweredQuestions: Array<{ question: string; whatWasMissing: string }>;
  /** true when there were ungrounded claims or unanswered questions — a human should look */
  needsHumanReview: boolean;
  strengths: string[];
  weaknesses: Array<{ issue: string; example: string; severity: "low" | "medium" | "high" }>;
  promptPatch: {
    /** false when the agent performed well and no prompt change is warranted */
    changesRecommended: boolean;
    rationale: string;
    /** full proposed new base instructions (the editable part of the prompt) */
    newInstructions: string;
  };
  knowledgeGaps: Array<{ question: string; suggestedAddition: string }>;
  actionItems: string[];
  evalCases: Array<{ question: string; rubric: string }>;
  /** feedback the human reviewer gave for this analysis (prioritized in the patch) */
  humanFeedback?: string;
  analyzedAt: number;
}

export interface PromptVersion {
  version: number;
  /** the editable base instructions (profile/resume are appended automatically) */
  instructions: string;
  changelog: string;
  active: boolean;
  createdAt: number;
  /** session id this version was derived from, if any */
  derivedFromSession?: string;
}

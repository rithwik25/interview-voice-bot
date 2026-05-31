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

export interface AnalysisResult {
  summary: string;
  overallScore: number; // 1-10
  strengths: string[];
  weaknesses: Array<{ issue: string; example: string; severity: "low" | "medium" | "high" }>;
  promptPatch: {
    rationale: string;
    /** full proposed new base instructions (the editable part of the prompt) */
    newInstructions: string;
  };
  knowledgeGaps: Array<{ question: string; suggestedAddition: string }>;
  actionItems: string[];
  evalCases: Array<{ question: string; rubric: string }>;
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

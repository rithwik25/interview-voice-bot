"use client";

// Self-improvement console: pick a past session, run the coach agent, review its
// critique + proposed prompt patch, and apply it as a new prompt version
// (or roll back to a previous one).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ANALYSIS_CHECKS,
  type AnalysisResult,
  type CheckStatus,
  type PromptVersion,
  type SessionRecord,
} from "@/lib/types";

const CHECK_LABELS: Record<string, string> = Object.fromEntries(
  ANALYSIS_CHECKS.map((c) => [c.id, c.label])
);

const STATUS_STYLE: Record<CheckStatus, string> = {
  pass: "bg-green-100 text-green-700",
  warn: "bg-amber-100 text-amber-700",
  fail: "bg-red-100 text-red-700",
};
const STATUS_ICON: Record<CheckStatus, string> = { pass: "✓", warn: "!", fail: "✗" };

export default function ReviewPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selected, setSelected] = useState<SessionRecord | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [editedInstructions, setEditedInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const loadSessions = useCallback(async () => {
    const r = await fetch("/api/sessions").then((x) => x.json());
    setSessions(r.sessions ?? []);
  }, []);
  const loadVersions = useCallback(async () => {
    const r = await fetch("/api/prompt").then((x) => x.json());
    setVersions(r.versions ?? []);
  }, []);

  useEffect(() => {
    // One-time initial data load on mount (state is set after the async fetches).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([loadSessions(), loadVersions()]);
  }, [loadSessions, loadVersions]);

  const select = (s: SessionRecord) => {
    setSelected(s);
    setMsg(null);
    setEditedInstructions(s.analysis?.promptPatch.newInstructions ?? "");
    setFeedback(s.analysis?.humanFeedback ?? "");
  };

  const analyze = async () => {
    if (!selected) return;
    setAnalyzing(true);
    setMsg(null);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selected.id, humanFeedback: feedback }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      const analysis = r.analysis as AnalysisResult;
      setSelected({ ...selected, analysis });
      setEditedInstructions(analysis.promptPatch.newInstructions);
      await loadSessions();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const applyPatch = async () => {
    if (!editedInstructions.trim() || !selected) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          instructions: editedInstructions,
          changelog: `Improved from session ${selected.id.slice(0, 8)} (score ${
            selected.analysis?.overallScore ?? "?"
          }/10)`,
          derivedFromSession: selected.id,
        }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setMsg(`Applied as prompt v${r.version.version} (now active).`);
      await loadVersions();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (version: number) => {
    await fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate", version }),
    });
    await loadVersions();
  };

  const a = selected?.analysis;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Review &amp; improve</h1>
        <Link href="/interview" className="text-sm text-blue-600 underline">
          ← Back to interview
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* Sessions list */}
        <aside className="space-y-4">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Sessions
            </h2>
            <div className="space-y-1">
              {sessions.length === 0 && (
                <p className="text-sm text-neutral-400">No sessions yet.</p>
              )}
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => select(s)}
                  className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${
                    selected?.id === s.id
                      ? "border-black bg-neutral-100 dark:border-white dark:bg-neutral-800"
                      : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                  }`}
                >
                  <div className="font-medium">
                    {new Date(s.startedAt).toLocaleString()}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {s.transcript.length} turns · v{s.promptVersion}
                    {s.analysis ? ` · ${s.analysis.overallScore}/10` : ""}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Prompt versions
            </h2>
            <div className="space-y-1">
              {versions
                .slice()
                .sort((x, y) => y.version - x.version)
                .map((v) => (
                  <div
                    key={v.version}
                    className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
                  >
                    <span>
                      v{v.version} {v.active && <span className="text-green-600">●</span>}
                    </span>
                    {!v.active && (
                      <button
                        onClick={() => activate(v.version)}
                        className="text-xs text-blue-600 underline"
                      >
                        activate
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </section>
        </aside>

        {/* Detail */}
        <section className="space-y-4">
          {!selected && (
            <p className="text-sm text-neutral-400">Select a session to review.</p>
          )}

          {selected && (
            <>
              <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <label className="text-sm font-medium">
                  Your feedback (optional, highest priority)
                </label>
                <p className="mb-2 text-xs text-neutral-500">
                  Add your own notes on this interview. The coach will prioritize this
                  above its own judgment when rewriting the prompt — useful for questions
                  the data couldn&apos;t answer.
                </p>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g. 'For the Kubernetes question, say I'm keen to learn it and have strong Docker/AWS fundamentals. Be more concise on the Quadeye answer.'"
                  className="h-24 w-full rounded-md border border-neutral-300 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={analyze}
                    disabled={analyzing}
                    className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {analyzing
                      ? "Analyzing…"
                      : a
                      ? feedback.trim()
                        ? "Re-run with my feedback"
                        : "Re-run analysis"
                      : "Run analysis"}
                  </button>
                  {msg && <span className="text-sm text-neutral-600">{msg}</span>}
                </div>
              </div>

              {/* Transcript */}
              <details className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <summary className="cursor-pointer text-sm font-medium">
                  Transcript ({selected.transcript.length} turns)
                </summary>
                <div className="mt-3 space-y-2 text-sm">
                  {selected.transcript.map((t, i) => (
                    <p key={i}>
                      <span className="font-medium">
                        {t.speaker === "agent" ? "Rithwik" : "Interviewer"}:
                      </span>{" "}
                      {t.text}
                    </p>
                  ))}
                </div>
              </details>

              {a && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Analysis</h3>
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium dark:bg-neutral-800">
                        {a.overallScore}/10
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                      {a.summary}
                    </p>

                    {a.needsHumanReview && (
                      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                        ⚑ <span className="font-semibold">Needs human review</span> — the
                        agent made claims not in your data and/or hit questions it
                        couldn&apos;t answer (see below). Add guidance in the feedback box
                        and re-run.
                      </div>
                    )}

                    <Section title="Quality checks">
                      <ul className="space-y-1 text-sm">
                        {(a.checks ?? []).map((c, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${STATUS_STYLE[c.status]}`}
                            >
                              {STATUS_ICON[c.status]}
                            </span>
                            <span>
                              <span className="font-medium">
                                {CHECK_LABELS[c.id] ?? c.id}
                              </span>
                              {c.detail && (
                                <span className="block text-neutral-500">{c.detail}</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Section>

                    {a.ungroundedClaims?.length > 0 && (
                      <Section title="⚠ Ungrounded claims (not in your data)">
                        <ul className="space-y-1 text-sm">
                          {a.ungroundedClaims.map((u, i) => (
                            <li key={i}>
                              <span className="font-medium text-red-600">
                                &ldquo;{u.quote}&rdquo;
                              </span>
                              <span className="block text-neutral-500">↳ {u.issue}</span>
                            </li>
                          ))}
                        </ul>
                      </Section>
                    )}

                    {a.unansweredQuestions?.length > 0 && (
                      <Section title="❓ Questions your data couldn't answer (need your input)">
                        <ul className="space-y-1 text-sm">
                          {a.unansweredQuestions.map((q, i) => (
                            <li key={i}>
                              <span className="font-medium">{q.question}</span>
                              <span className="block text-neutral-500">
                                ↳ missing: {q.whatWasMissing}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </Section>
                    )}

                    <Section title="Strengths">
                      <ul className="list-inside list-disc text-sm">
                        {a.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </Section>

                    <Section title="Weaknesses">
                      <ul className="space-y-1 text-sm">
                        {a.weaknesses.map((w, i) => (
                          <li key={i}>
                            <span
                              className={`mr-2 rounded px-1.5 py-0.5 text-xs ${
                                w.severity === "high"
                                  ? "bg-red-100 text-red-700"
                                  : w.severity === "medium"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {w.severity}
                            </span>
                            <span className="font-medium">{w.issue}</span>
                            <span className="block pl-2 text-neutral-500">↳ {w.example}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>

                    <Section title="Knowledge gaps">
                      <ul className="space-y-1 text-sm">
                        {a.knowledgeGaps.map((g, i) => (
                          <li key={i}>
                            <span className="font-medium">{g.question}</span> →{" "}
                            {g.suggestedAddition}
                          </li>
                        ))}
                      </ul>
                    </Section>

                    {a.actionItems.length > 0 && (
                      <Section title="Action items">
                        <ul className="list-inside list-disc text-sm">
                          {a.actionItems.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </Section>
                    )}

                    {a.evalCases.length > 0 && (
                      <Section title="Eval cases (regression set)">
                        <ul className="space-y-1 text-sm">
                          {a.evalCases.map((e, i) => (
                            <li key={i}>
                              <span className="font-medium">Q:</span> {e.question}{" "}
                              <span className="text-neutral-500">— {e.rubric}</span>
                            </li>
                          ))}
                        </ul>
                      </Section>
                    )}
                  </div>

                  {/* Prompt patch */}
                  <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                    <h3 className="font-semibold">Proposed prompt patch</h3>
                    <p className="mt-1 text-sm text-neutral-500">{a.promptPatch.rationale}</p>
                    <textarea
                      value={editedInstructions}
                      onChange={(e) => setEditedInstructions(e.target.value)}
                      className="mt-3 h-64 w-full rounded-md border border-neutral-300 p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
                    />
                    <button
                      onClick={applyPatch}
                      disabled={busy}
                      className="mt-3 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {busy ? "Applying…" : "Apply as new active version"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h4>
      {children}
    </div>
  );
}

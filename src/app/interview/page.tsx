"use client";

// Interviewer-facing call page. Open this link, allow the mic, and talk to the
// candidate's voice agent. Transcript is captured live and saved on end.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RealtimeClient, type ConnectionStatus } from "@/lib/realtime-client";
import type { Speaker, ToolEvent, TranscriptTurn } from "@/lib/types";

// Minimal typings for the browser Web Speech API (no DOM lib types for it).
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  0: SRAlternative;
  isFinal: boolean;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SRInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SRCtor = new () => SRInstance;

function getSpeechRecognition(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRCtor;
    webkitSpeechRecognition?: SRCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  connected: "Live",
  error: "Error",
  closed: "Ended",
};

export default function InterviewPage() {
  const clientRef = useRef<RealtimeClient | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [partial, setPartial] = useState<{ speaker: Speaker; text: string } | null>(null);
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [saved, setSaved] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const turnsRef = useRef<TranscriptTurn[]>([]);
  const toolsRef = useRef<ToolEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SRInstance | null>(null);
  // True while the agent is talking — used to ignore the mic picking up the
  // agent's own voice in the live caption preview (echo).
  const agentSpeakingRef = useRef(false);

  // Remember the last-used job description locally so it persists between visits.
  useEffect(() => {
    const saved = localStorage.getItem("elyx_jd");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydrate from localStorage on mount
    if (saved) setJobDescription(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("elyx_jd", jobDescription);
  }, [jobDescription]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, partial]);

  const persist = useCallback(async (ended: boolean) => {
    const client = clientRef.current;
    if (!client?.meta) return;
    await fetch("/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: client.meta.sessionId,
        promptVersion: client.meta.promptVersion,
        startedAt: client.meta.startedAt,
        endedAt: ended ? Date.now() : null,
        jobDescription: client.meta.jobDescription,
        transcript: turnsRef.current,
        toolEvents: toolsRef.current,
      }),
    });
  }, []);

  // Live preview captions for the interviewer via the browser's Web Speech API.
  // OpenAI's input transcription only finalizes after each utterance, so this gives
  // a word-by-word preview while they speak. Best-effort, Chrome/Edge only.
  const startLiveCaptions = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR || recognitionRef.current) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: SREvent) => {
      // Ignore while the agent is speaking (avoid captioning the agent's own voice).
      if (agentSpeakingRef.current) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r.isFinal) interim += r[0].transcript;
      }
      if (interim.trim()) setPartial({ speaker: "interviewer", text: interim });
    };
    rec.onend = () => {
      // Chrome stops periodically — restart while the call is live.
      if (recognitionRef.current === rec) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      /* ignore */
    }
  }, []);

  const stopLiveCaptions = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    turnsRef.current = [];
    toolsRef.current = [];
    setTurns([]);
    setTools([]);
    setSaved(false);
    agentSpeakingRef.current = false;
    const client = new RealtimeClient({
      onStatus: (s, detail) => {
        setStatus(s);
        if (s === "connected") startLiveCaptions();
        if (s === "closed" || s === "error") stopLiveCaptions();
        if (s === "error" && detail) setError(detail);
      },
      onTranscript: (t) => {
        if (t.speaker === "agent") agentSpeakingRef.current = false;
        const nextTurns = [...turnsRef.current, t];
        turnsRef.current = nextTurns;
        setTurns(nextTurns);
        setPartial(null);
      },
      onPartial: (speaker, text) => {
        if (speaker === "agent") agentSpeakingRef.current = true;
        setPartial((prev) =>
          prev && prev.speaker === speaker
            ? { speaker, text: prev.text + text }
            : { speaker, text }
        );
      },
      onTool: (e) => {
        const nextTools = [...toolsRef.current, e];
        toolsRef.current = nextTools;
        setTools(nextTools);
        void persist(false);
      },
      onError: (m) => setError(m),
    });
    clientRef.current = client;
    await client.connect({ jobDescription: jobDescription.trim() || undefined });
  }, [jobDescription, persist, startLiveCaptions, stopLiveCaptions]);

  const end = useCallback(async () => {
    await persist(true);
    setSaved(true);
    clientRef.current?.disconnect();
  }, [persist]);

  // Autosave every 10s while connected (resilience).
  useEffect(() => {
    if (status !== "connected") return;
    const id = setInterval(() => persist(false), 10000);
    return () => clearInterval(id);
  }, [status, persist]);

  // Stop live captions if the page unmounts mid-call.
  useEffect(() => () => stopLiveCaptions(), [stopLiveCaptions]);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    clientRef.current?.setMicEnabled(next);
  };

  const live = status === "connected" || status === "connecting";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Interview with Rithwik&apos;s agent</h1>
          <p className="text-sm text-neutral-500">
            You are speaking with an AI representative. Please talk naturally.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            status === "connected"
              ? "bg-green-100 text-green-700"
              : status === "error"
              ? "bg-red-100 text-red-700"
              : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {STATUS_LABEL[status]}
        </span>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {status === "idle" && (
        <details className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800" open={!jobDescription}>
          <summary className="cursor-pointer text-sm font-medium">
            Job &amp; company description for this role{" "}
            <span className="text-neutral-400">
              (optional — the agent aligns every answer to it)
            </span>
          </summary>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description AND a bit about the company here. The agent will lead with your most relevant experience, mirror the role's priorities, and ground 'why this role/company' answers in it."
            className="mt-3 h-40 w-full rounded-md border border-neutral-300 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Remembered on this device. Set it before starting the interview.
          </p>
        </details>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        style={{ minHeight: 320 }}
      >
        {turns.length === 0 && !partial && (
          <p className="text-sm text-neutral-400">
            Transcript will appear here once the conversation starts.
          </p>
        )}
        {turns.map((t, i) => (
          <Bubble key={i} speaker={t.speaker} text={t.text} />
        ))}
        {partial && <Bubble speaker={partial.speaker} text={partial.text} faded />}
      </div>

      {tools.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">⚑ Flagged for review ({tools.length})</p>
          <ul className="mt-1 list-inside list-disc">
            {tools.map((t, i) => (
              <li key={i}>
                {String((t.args as { topic?: string }).topic ?? t.name)} —{" "}
                {String((t.args as { reason?: string }).reason ?? "")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        {!live && status !== "closed" && (
          <button
            onClick={connect}
            className="rounded-md bg-black px-5 py-2.5 font-medium text-white hover:bg-neutral-800"
          >
            Start interview
          </button>
        )}
        {live && (
          <>
            <button
              onClick={toggleMic}
              className="rounded-md border border-neutral-300 px-4 py-2.5 font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {micOn ? "Mute mic" : "Unmute mic"}
            </button>
            <button
              onClick={end}
              className="rounded-md bg-red-600 px-5 py-2.5 font-medium text-white hover:bg-red-700"
            >
              End interview
            </button>
          </>
        )}
        {status === "closed" && (
          <div className="flex items-center gap-3">
            <button
              onClick={connect}
              className="rounded-md bg-black px-5 py-2.5 font-medium text-white hover:bg-neutral-800"
            >
              Start again
            </button>
            {saved && (
              <Link href="/review" className="text-sm text-blue-600 underline">
                View &amp; analyze this session →
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Bubble({
  speaker,
  text,
  faded,
}: {
  speaker: Speaker;
  text: string;
  faded?: boolean;
}) {
  const isAgent = speaker === "agent";
  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isAgent
            ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
            : "bg-blue-600 text-white"
        } ${faded ? "opacity-60" : ""}`}
      >
        <span className="mb-0.5 block text-xs font-medium opacity-60">
          {isAgent ? "Rithwik (agent)" : "Interviewer"}
        </span>
        {text}
      </div>
    </div>
  );
}

"use client";

// Interviewer-facing call page. Open this link, allow the mic, and talk to the
// candidate's voice agent. Transcript is captured live and saved on end.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RealtimeClient, type ConnectionStatus } from "@/lib/realtime-client";
import type { Speaker, ToolEvent, TranscriptTurn } from "@/lib/types";

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
  const turnsRef = useRef<TranscriptTurn[]>([]);
  const toolsRef = useRef<ToolEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  useEffect(() => {
    toolsRef.current = tools;
  }, [tools]);

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
        transcript: turnsRef.current,
        toolEvents: toolsRef.current,
      }),
    });
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setTurns([]);
    setTools([]);
    setSaved(false);
    const client = new RealtimeClient({
      onStatus: (s, detail) => {
        setStatus(s);
        if (s === "error" && detail) setError(detail);
      },
      onTranscript: (t) => {
        setTurns((prev) => [...prev, t]);
        setPartial(null);
      },
      onPartial: (speaker, text) =>
        setPartial((prev) =>
          prev && prev.speaker === speaker
            ? { speaker, text: prev.text + text }
            : { speaker, text }
        ),
      onTool: (e) => setTools((prev) => [...prev, e]),
      onError: (m) => setError(m),
    });
    clientRef.current = client;
    await client.connect();
  }, []);

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

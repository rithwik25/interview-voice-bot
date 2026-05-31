// Persists a completed (or in-progress) interview session transcript.

import { NextResponse } from "next/server";
import { saveSession, getSession } from "@/lib/store";
import type { SessionRecord } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<SessionRecord>;
  if (!body.id) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }

  const existing = await getSession(body.id);
  const session: SessionRecord = {
    id: body.id,
    promptVersion: body.promptVersion ?? existing?.promptVersion ?? 1,
    startedAt: body.startedAt ?? existing?.startedAt ?? Date.now(),
    endedAt: body.endedAt ?? Date.now(),
    transcript: body.transcript ?? existing?.transcript ?? [],
    toolEvents: body.toolEvents ?? existing?.toolEvents ?? [],
    rating: body.rating ?? existing?.rating,
    notes: body.notes ?? existing?.notes,
    analysis: existing?.analysis,
  };

  await saveSession(session);
  return NextResponse.json({ ok: true, id: session.id });
}

// Postgres-backed persistence (Neon). Same function surface as store-file.ts.

import { sql, ensureSchema } from "./db";
import type { PromptVersion, SessionRecord } from "./types";
import seedPrompts from "@/data/prompt-versions.json";

function db() {
  if (!sql) throw new Error("DATABASE_URL is not set");
  return sql;
}

// ---------- Prompt versions ----------

export async function getPromptVersions(): Promise<PromptVersion[]> {
  await ensureSchema();
  const rows = await db()`SELECT * FROM prompt_versions ORDER BY version ASC`;
  if (rows.length === 0) {
    // Seed v1 from the bundled defaults on first run.
    for (const v of seedPrompts.versions as PromptVersion[]) {
      await db()`
        INSERT INTO prompt_versions (version, instructions, changelog, active, created_at)
        VALUES (${v.version}, ${v.instructions}, ${v.changelog}, ${v.active}, ${v.createdAt})
        ON CONFLICT (version) DO NOTHING`;
    }
    return seedPrompts.versions as PromptVersion[];
  }
  return rows.map(rowToVersion);
}

export async function savePromptVersions(versions: PromptVersion[]): Promise<void> {
  await ensureSchema();
  // Replace the whole set transactionally enough for our low-concurrency use.
  await db()`DELETE FROM prompt_versions`;
  for (const v of versions) {
    await db()`
      INSERT INTO prompt_versions (version, instructions, changelog, active, created_at, derived_from_session)
      VALUES (${v.version}, ${v.instructions}, ${v.changelog}, ${v.active}, ${v.createdAt}, ${v.derivedFromSession ?? null})`;
  }
}

// ---------- Sessions ----------

export async function saveSession(session: SessionRecord): Promise<void> {
  await ensureSchema();
  await db()`
    INSERT INTO sessions (id, prompt_version, started_at, ended_at, job_description, transcript, tool_events, rating, notes, analysis)
    VALUES (
      ${session.id}, ${session.promptVersion}, ${session.startedAt}, ${session.endedAt},
      ${session.jobDescription ?? null},
      ${JSON.stringify(session.transcript)}, ${JSON.stringify(session.toolEvents)},
      ${session.rating ?? null}, ${session.notes ?? null},
      ${session.analysis ? JSON.stringify(session.analysis) : null}
    )
    ON CONFLICT (id) DO UPDATE SET
      prompt_version = EXCLUDED.prompt_version,
      started_at = EXCLUDED.started_at,
      ended_at = EXCLUDED.ended_at,
      job_description = EXCLUDED.job_description,
      transcript = EXCLUDED.transcript,
      tool_events = EXCLUDED.tool_events,
      rating = EXCLUDED.rating,
      notes = EXCLUDED.notes,
      analysis = EXCLUDED.analysis`;
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  await ensureSchema();
  const rows = await db()`SELECT * FROM sessions WHERE id = ${id}`;
  return rows.length ? rowToSession(rows[0]) : null;
}

export async function listSessions(): Promise<SessionRecord[]> {
  await ensureSchema();
  const rows = await db()`SELECT * FROM sessions ORDER BY started_at DESC`;
  return rows.map(rowToSession);
}

// ---------- mappers ----------

function rowToVersion(r: Record<string, unknown>): PromptVersion {
  return {
    version: Number(r.version),
    instructions: String(r.instructions),
    changelog: String(r.changelog ?? ""),
    active: Boolean(r.active),
    createdAt: Number(r.created_at),
    derivedFromSession: (r.derived_from_session as string) ?? undefined,
  };
}

function rowToSession(r: Record<string, unknown>): SessionRecord {
  return {
    id: String(r.id),
    promptVersion: Number(r.prompt_version),
    startedAt: Number(r.started_at),
    endedAt: r.ended_at == null ? null : Number(r.ended_at),
    jobDescription: (r.job_description as string) ?? undefined,
    transcript: (r.transcript as SessionRecord["transcript"]) ?? [],
    toolEvents: (r.tool_events as SessionRecord["toolEvents"]) ?? [],
    rating: r.rating == null ? undefined : Number(r.rating),
    notes: (r.notes as string) ?? undefined,
    analysis: (r.analysis as SessionRecord["analysis"]) ?? undefined,
  };
}

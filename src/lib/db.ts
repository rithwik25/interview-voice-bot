// Neon Postgres client + lazy schema initialization.
// Used in production (and anywhere DATABASE_URL is set).

import { neon } from "@neondatabase/serverless";

export const hasDatabase = !!process.env.DATABASE_URL;

// `neon()` is a lightweight HTTP client — safe to create per module load.
export const sql = hasDatabase ? neon(process.env.DATABASE_URL!) : null;

let schemaReady: Promise<void> | null = null;

/** Create tables on first use (idempotent). Cached so it runs once per instance. */
export function ensureSchema(): Promise<void> {
  if (!sql) throw new Error("DATABASE_URL is not set");
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS prompt_versions (
          version             INTEGER PRIMARY KEY,
          instructions        TEXT NOT NULL,
          changelog           TEXT NOT NULL DEFAULT '',
          active              BOOLEAN NOT NULL DEFAULT false,
          created_at          BIGINT NOT NULL,
          derived_from_session TEXT
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS sessions (
          id             TEXT PRIMARY KEY,
          prompt_version INTEGER NOT NULL,
          started_at     BIGINT NOT NULL,
          ended_at       BIGINT,
          transcript     JSONB NOT NULL DEFAULT '[]'::jsonb,
          tool_events    JSONB NOT NULL DEFAULT '[]'::jsonb,
          rating         INTEGER,
          notes          TEXT,
          analysis       JSONB
        )`;
      // Added after initial release — idempotent so existing tables get it too.
      await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS job_description TEXT`;
    })();
  }
  return schemaReady;
}

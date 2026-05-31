// Persistence facade. Dispatches to Postgres (Neon) when DATABASE_URL is set,
// otherwise to the local file store. Call sites import only from here, so
// switching backends never touches the API routes.
//
// Higher-level helpers (active version, add, activate) are implemented once here
// on top of the backend's get/save primitives.

import { hasDatabase } from "./db";
import * as fileStore from "./store-file";
import * as pgStore from "./store-pg";
import type { PromptVersion, SessionRecord } from "./types";

const backend = hasDatabase ? pgStore : fileStore;

// ---------- Prompt versions ----------

export function getPromptVersions(): Promise<PromptVersion[]> {
  return backend.getPromptVersions();
}

export async function getActivePromptVersion(): Promise<PromptVersion> {
  const versions = await backend.getPromptVersions();
  return (
    versions.find((v) => v.active) ??
    versions.sort((a, b) => b.version - a.version)[0]
  );
}

export async function addPromptVersion(input: {
  instructions: string;
  changelog: string;
  derivedFromSession?: string;
}): Promise<PromptVersion> {
  const versions = await backend.getPromptVersions();
  const nextVersion = Math.max(0, ...versions.map((v) => v.version)) + 1;
  const created: PromptVersion = {
    version: nextVersion,
    instructions: input.instructions,
    changelog: input.changelog,
    active: true,
    createdAt: Date.now(),
    derivedFromSession: input.derivedFromSession,
  };
  const updated = versions.map((v) => ({ ...v, active: false }));
  updated.push(created);
  await backend.savePromptVersions(updated);
  return created;
}

export async function activatePromptVersion(version: number): Promise<void> {
  const versions = await backend.getPromptVersions();
  await backend.savePromptVersions(
    versions.map((v) => ({ ...v, active: v.version === version }))
  );
}

// ---------- Sessions ----------

export function saveSession(session: SessionRecord): Promise<void> {
  return backend.saveSession(session);
}

export function getSession(id: string): Promise<SessionRecord | null> {
  return backend.getSession(id);
}

export function listSessions(): Promise<SessionRecord[]> {
  return backend.listSessions();
}

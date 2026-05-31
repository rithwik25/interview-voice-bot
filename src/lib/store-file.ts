// File-based persistence for local dev (used when DATABASE_URL is not set).
// Sessions and prompt versions live under `.data/` at the project root.

import { promises as fs } from "fs";
import path from "path";
import type { PromptVersion, SessionRecord } from "./types";
import seedPrompts from "@/data/prompt-versions.json";

const DATA_DIR = path.join(process.cwd(), ".data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const PROMPTS_FILE = path.join(DATA_DIR, "prompt-versions.json");

async function ensureDirs() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

export async function getPromptVersions(): Promise<PromptVersion[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(PROMPTS_FILE, "utf8");
    return JSON.parse(raw) as PromptVersion[];
  } catch {
    const seeded = seedPrompts.versions as PromptVersion[];
    await fs.writeFile(PROMPTS_FILE, JSON.stringify(seeded, null, 2), "utf8");
    return seeded;
  }
}

export async function savePromptVersions(versions: PromptVersion[]): Promise<void> {
  await ensureDirs();
  await fs.writeFile(PROMPTS_FILE, JSON.stringify(versions, null, 2), "utf8");
}

export async function saveSession(session: SessionRecord): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    path.join(SESSIONS_DIR, `${session.id}.json`),
    JSON.stringify(session, null, 2),
    "utf8"
  );
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  try {
    const raw = await fs.readFile(path.join(SESSIONS_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }
}

export async function listSessions(): Promise<SessionRecord[]> {
  await ensureDirs();
  const files = await fs.readdir(SESSIONS_DIR);
  const sessions: SessionRecord[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(SESSIONS_DIR, f), "utf8");
      sessions.push(JSON.parse(raw) as SessionRecord);
    } catch {
      /* skip corrupt */
    }
  }
  return sessions.sort((a, b) => b.startedAt - a.startedAt);
}

// Manage prompt versions: list, add a new version, or activate (rollback to) one.

import { NextResponse } from "next/server";
import {
  getPromptVersions,
  addPromptVersion,
  activatePromptVersion,
} from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const versions = await getPromptVersions();
  return NextResponse.json({ versions });
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "activate" && typeof body.version === "number") {
    await activatePromptVersion(body.version);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "add" && typeof body.instructions === "string") {
    const created = await addPromptVersion({
      instructions: body.instructions,
      changelog: body.changelog ?? "Added via review.",
      derivedFromSession: body.derivedFromSession,
    });
    return NextResponse.json({ ok: true, version: created });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

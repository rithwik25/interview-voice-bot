// Lists all saved sessions (most recent first).

import { NextResponse } from "next/server";
import { listSessions } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const sessions = await listSessions();
  return NextResponse.json({ sessions });
}

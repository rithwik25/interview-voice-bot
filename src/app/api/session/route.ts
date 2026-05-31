// Mints a short-lived ephemeral Realtime token for the browser.
// The real OPENAI_API_KEY never leaves the server. The full session config
// (instructions + profile + tools + transcription) is bound to the token here.

import { NextResponse } from "next/server";
import { getActivePromptVersion } from "@/lib/store";
import { buildInstructions } from "@/lib/prompt";
import { buildSessionConfig, REALTIME_MODEL } from "@/lib/realtime-config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set on the server." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const jobDescription: string | undefined =
    typeof body?.jobDescription === "string" ? body.jobDescription : undefined;

  const promptVersion = await getActivePromptVersion();
  const instructions = buildInstructions(promptVersion, jobDescription);
  const session = buildSessionConfig(instructions);

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Failed to mint Realtime token", detail },
      { status: 502 }
    );
  }

  const data = await res.json();
  // GA returns { value, expires_at, session }; older shapes use client_secret.value
  const value: string | undefined = data.value ?? data.client_secret?.value;
  if (!value) {
    return NextResponse.json(
      { error: "No ephemeral token in response", detail: data },
      { status: 502 }
    );
  }

  return NextResponse.json({
    token: value,
    model: REALTIME_MODEL,
    expiresAt: data.expires_at ?? null,
    promptVersion: promptVersion.version,
    sessionId: crypto.randomUUID(),
  });
}

// Browser-side WebRTC client for the OpenAI Realtime API.
// Flow: get ephemeral token from our /api/session -> open RTCPeerConnection ->
// add mic track -> open data channel for events -> SDP exchange with OpenAI.
// Audio flows browser <-> OpenAI directly (our server is never in the media path).

import type { Speaker, ToolEvent, TranscriptTurn } from "./types";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "closed";

export interface RealtimeCallbacks {
  onStatus?: (status: ConnectionStatus, detail?: string) => void;
  onTranscript?: (turn: TranscriptTurn) => void;
  /** partial live caption (not yet committed) */
  onPartial?: (speaker: Speaker, text: string) => void;
  onTool?: (event: ToolEvent) => void;
  onError?: (message: string) => void;
}

export interface SessionMeta {
  sessionId: string;
  promptVersion: number;
  startedAt: number;
  jobDescription?: string;
}

const SDP_URL = "https://api.openai.com/v1/realtime/calls";

export class RealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private cb: RealtimeCallbacks;
  // call_id -> function name, captured from response.output_item.added
  private functionNames = new Map<string, string>();

  meta: SessionMeta | null = null;

  constructor(callbacks: RealtimeCallbacks) {
    this.cb = callbacks;
  }

  async connect(opts?: { jobDescription?: string }): Promise<void> {
    this.cb.onStatus?.("connecting");
    try {
      // 1. Mint ephemeral token + session config from our backend.
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: opts?.jobDescription }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Session mint failed (${res.status})`);
      }
      const { token, model, sessionId, promptVersion } = await res.json();
      this.meta = {
        sessionId,
        promptVersion,
        startedAt: Date.now(),
        jobDescription: opts?.jobDescription,
      };

      // 2. Peer connection + remote audio sink.
      const pc = new RTCPeerConnection();
      this.pc = pc;

      this.audioEl = new Audio();
      this.audioEl.autoplay = true;
      pc.ontrack = (e) => {
        if (this.audioEl) this.audioEl.srcObject = e.streams[0];
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") this.cb.onStatus?.("connected");
        if (pc.connectionState === "failed") this.cb.onStatus?.("error", "peer failed");
        if (pc.connectionState === "closed") this.cb.onStatus?.("closed");
      };

      // 3. Mic input (the interviewer's microphone).
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of this.micStream.getTracks()) {
        pc.addTrack(track, this.micStream);
      }

      // 4. Data channel for realtime events.
      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onmessage = (e) => this.handleEvent(JSON.parse(e.data));

      // 5. SDP offer/answer with OpenAI using the ephemeral token.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(`${SDP_URL}?model=${encodeURIComponent(model)}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpRes.ok) {
        throw new Error(`SDP exchange failed (${sdpRes.status}): ${await sdpRes.text()}`);
      }
      const answer = { type: "answer" as const, sdp: await sdpRes.text() };
      await pc.setRemoteDescription(answer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.cb.onStatus?.("error", msg);
      this.cb.onError?.(msg);
      this.disconnect();
    }
  }

  private emitTurn(speaker: Speaker, text: string) {
    const clean = text.trim();
    if (!clean) return;
    this.cb.onTranscript?.({ speaker, text: clean, ts: Date.now() });
  }

  private handleEvent(evt: { type: string; [k: string]: unknown }) {
    switch (evt.type) {
      // Interviewer speech transcribed (input audio).
      case "conversation.item.input_audio_transcription.completed":
        this.emitTurn("interviewer", String(evt.transcript ?? ""));
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (evt.delta) this.cb.onPartial?.("interviewer", String(evt.delta));
        break;

      // Agent (candidate) speech transcript.
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        if (evt.delta) this.cb.onPartial?.("agent", String(evt.delta));
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        this.emitTurn("agent", String(evt.transcript ?? ""));
        break;

      // Track function-call names so we can resolve them on completion.
      case "response.output_item.added": {
        const item = evt.item as { type?: string; name?: string; call_id?: string } | undefined;
        if (item?.type === "function_call" && item.call_id && item.name) {
          this.functionNames.set(item.call_id, item.name);
        }
        break;
      }

      // A tool/function call finished — surface it and return output.
      case "response.function_call_arguments.done": {
        const callId = String(evt.call_id ?? "");
        const name = this.functionNames.get(callId) ?? String(evt.name ?? "unknown");
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(String(evt.arguments ?? "{}"));
        } catch {
          /* ignore parse errors */
        }
        this.cb.onTool?.({ name, args, ts: Date.now() });
        // Acknowledge the function call. For flag_uncertain specifically, do NOT
        // send response.create — the agent has already finished speaking and
        // flag_uncertain is a silent post-response signal. Sending response.create
        // here would cause the model to generate an unwanted second audio turn.
        this.send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ acknowledged: true }),
          },
        });
        if (name !== "flag_uncertain") {
          this.send({ type: "response.create" });
        }
        break;
      }

      case "error":
        this.cb.onError?.(JSON.stringify(evt.error ?? evt));
        break;
    }
  }

  private send(obj: unknown) {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(obj));
    }
  }

  setMicEnabled(enabled: boolean) {
    this.micStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  disconnect() {
    this.dc?.close();
    this.pc?.getSenders().forEach((s) => s.track?.stop());
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.micStream = null;
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
    this.cb.onStatus?.("closed");
  }
}

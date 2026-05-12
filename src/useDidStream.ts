import { useCallback, useEffect, useRef, useState } from "react";
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from "react-native-webrtc";

import { API_BASE_URL } from "./config";

type Status =
  | "idle"
  | "connecting"
  | "connected"
  | "speaking"
  | "error"
  | "closed";

type Step =
  | "init"
  | "create-stream-post"
  | "create-stream-ok"
  | "set-remote"
  | "create-answer"
  | "set-local"
  | "sdp-post"
  | "sdp-ok"
  | "waiting-ice"
  | "ice-connected"
  | "track-received"
  | "failed";

type CreateResponse = {
  id: string;
  session_id: string;
  offer: RTCSessionDescriptionInit;
  ice_servers: { urls: string | string[]; username?: string; credential?: string }[];
};

export type StreamDebug = {
  step: Step;
  message: string;
  iceState?: string;
  connState?: string;
  apiBase: string;
};

export function useDidStream() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [debug, setDebug] = useState<StreamDebug>({
    step: "init",
    message: "idle",
    apiBase: API_BASE_URL,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const connectingRef = useRef(false);

  const trace = (step: Step, message: string, extras?: Partial<StreamDebug>) => {
    console.log(`[stream] ${step}: ${message}`, extras ?? "");
    setDebug((d) => ({ ...d, step, message, ...(extras ?? {}) }));
  };

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    setRemoteStream(null);
  }, []);

  const disconnect = useCallback(async () => {
    const id = streamIdRef.current;
    const session = sessionIdRef.current;
    streamIdRef.current = null;
    sessionIdRef.current = null;
    cleanup();
    setStatus("closed");
    if (id && session) {
      try {
        await fetch(`${API_BASE_URL}/api/streams/${id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: session }),
        });
      } catch {}
    }
  }, [cleanup]);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setError(null);
    setStatus("connecting");

    try {
      trace("create-stream-post", `POST ${API_BASE_URL}/api/streams`);
      const res = await fetch(`${API_BASE_URL}/api/streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as CreateResponse | { error: any };
      if (!res.ok || !("offer" in json)) {
        const msg =
          "error" in json
            ? typeof json.error === "string"
              ? json.error
              : JSON.stringify(json.error).slice(0, 200)
            : `create failed ${res.status}`;
        throw new Error(`create-stream ${res.status}: ${msg}`);
      }
      if (!json.session_id) {
        throw new Error("backend response missing session_id");
      }
      trace("create-stream-ok", `id=${json.id.slice(0, 20)}…`);

      streamIdRef.current = json.id;
      sessionIdRef.current = json.session_id;

      const pc = new RTCPeerConnection({ iceServers: json.ice_servers as any });
      pcRef.current = pc;

      (pc as any).ontrack = (event: any) => {
        const stream: MediaStream | undefined = event.streams?.[0];
        if (stream) {
          trace("track-received", `tracks=${stream.getTracks?.().length ?? "?"}`);
          setRemoteStream(stream);
        }
      };

      (pc as any).onicecandidate = (event: any) => {
        const sid = streamIdRef.current;
        const session = sessionIdRef.current;
        if (!sid || !session) return;
        if (!event.candidate) return; // skip end-of-candidates null event
        fetch(`${API_BASE_URL}/api/streams/${sid}/ice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: session,
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          }),
        }).catch((e) => console.warn("[stream] ice POST failed", e));
      };

      (pc as any).onconnectionstatechange = () => {
        const state = (pc as any).connectionState as string | undefined;
        trace("waiting-ice", `connectionState=${state}`, { connState: state });
        if (state === "failed" || state === "disconnected") {
          setStatus("error");
          setError(`WebRTC ${state}`);
        }
      };

      (pc as any).oniceconnectionstatechange = () => {
        const ice = (pc as any).iceConnectionState as string | undefined;
        trace("waiting-ice", `iceConnectionState=${ice}`, { iceState: ice });
        if (ice === "connected" || ice === "completed") {
          trace("ice-connected", "ready");
          setStatus("connected");
        }
        if (ice === "failed") {
          setStatus("error");
          setError("ICE failed (often iOS Simulator network)");
        }
      };

      trace("set-remote", "applying D-ID offer");
      await pc.setRemoteDescription(
        new RTCSessionDescription(json.offer as any)
      );

      trace("create-answer", "");
      const answer = await pc.createAnswer();

      trace("set-local", `sdp_len=${answer.sdp?.length ?? 0}`);
      await pc.setLocalDescription(answer);

      // Use the *finalized* localDescription, not the createAnswer return value.
      const finalAnswer = (pc as any).localDescription ?? answer;

      trace(
        "sdp-post",
        `POST /sdp len=${finalAnswer.sdp?.length ?? 0}`
      );
      const sdpRes = await fetch(
        `${API_BASE_URL}/api/streams/${json.id}/sdp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: json.session_id,
            answer: { type: finalAnswer.type, sdp: finalAnswer.sdp },
          }),
        }
      );
      const sdpBody = await sdpRes.text();
      if (!sdpRes.ok) {
        throw new Error(
          `sdp ${sdpRes.status}: ${sdpBody.slice(0, 300)}`
        );
      }
      trace("sdp-ok", `${sdpRes.status}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      console.error("[stream] connect error:", e);
      trace("failed", msg);
      setError(msg);
      setStatus("error");
      cleanup();
    } finally {
      connectingRef.current = false;
    }
  }, [cleanup]);

  const speak = useCallback(async (text: string) => {
    const id = streamIdRef.current;
    const session = sessionIdRef.current;
    if (!id || !session) throw new Error("Stream not connected");
    setStatus("speaking");
    try {
      const res = await fetch(`${API_BASE_URL}/api/streams/${id}/talk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session, text }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`talk failed (${res.status}): ${err.slice(0, 200)}`);
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Speak failed");
      throw e;
    } finally {
      setTimeout(() => {
        setStatus((s) => (s === "speaking" ? "connected" : s));
      }, 300);
    }
  }, []);

  useEffect(() => {
    return () => {
      void disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, error, remoteStream, debug, connect, speak, disconnect };
}

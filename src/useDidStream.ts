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

type CreateResponse = {
  id: string;
  session_id: string;
  offer: RTCSessionDescriptionInit;
  ice_servers: { urls: string | string[]; username?: string; credential?: string }[];
};

export function useDidStream() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const connectingRef = useRef(false);

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
      const res = await fetch(`${API_BASE_URL}/api/streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as CreateResponse | { error: any };
      if (!res.ok || !("offer" in json)) {
        throw new Error(
          "error" in json
            ? typeof json.error === "string"
              ? json.error
              : JSON.stringify(json.error)
            : `stream create failed (${res.status})`
        );
      }

      streamIdRef.current = json.id;
      sessionIdRef.current = json.session_id;

      const pc = new RTCPeerConnection({
        iceServers: json.ice_servers as any,
      });
      pcRef.current = pc;

      // react-native-webrtc uses `on*` handler properties, not addEventListener.
      (pc as any).ontrack = (event: any) => {
        const stream: MediaStream | undefined = event.streams?.[0];
        if (stream) {
          setRemoteStream(stream);
          setStatus("connected");
        }
      };

      (pc as any).onicecandidate = (event: any) => {
        const sid = streamIdRef.current;
        const session = sessionIdRef.current;
        if (!sid || !session) return;
        const body: Record<string, any> = { session_id: session };
        if (event.candidate) {
          body.candidate = event.candidate.candidate;
          body.sdpMid = event.candidate.sdpMid;
          body.sdpMLineIndex = event.candidate.sdpMLineIndex;
        }
        fetch(`${API_BASE_URL}/api/streams/${sid}/ice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => {});
      };

      (pc as any).onconnectionstatechange = () => {
        const state = (pc as any).connectionState as string | undefined;
        if (state === "failed" || state === "disconnected") {
          setStatus("error");
          setError(`WebRTC ${state}`);
        }
      };

      await pc.setRemoteDescription(
        new RTCSessionDescription(json.offer as any)
      );
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const sdpRes = await fetch(
        `${API_BASE_URL}/api/streams/${json.id}/sdp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: json.session_id,
            answer: { type: answer.type, sdp: answer.sdp },
          }),
        }
      );
      if (!sdpRes.ok) throw new Error(`sdp exchange failed (${sdpRes.status})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stream connect failed");
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
        throw new Error(`talk failed (${res.status}): ${err}`);
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Speak failed");
      throw e;
    } finally {
      // Status will flip back to "connected" via track activity; we don't have
      // a clean signal so just optimistically restore once the talk POST returns.
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

  return { status, error, remoteStream, connect, speak, disconnect };
}

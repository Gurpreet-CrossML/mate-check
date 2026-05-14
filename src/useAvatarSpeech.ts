import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

import { fetchTtsClip, type TtsClip } from "./api";

type Status = "idle" | "loading" | "speaking" | "error";

/**
 * Fetches TTS audio + amplitude envelope from the backend, plays the
 * audio, and continuously updates `amplitudeRef.current` so a
 * companion view (e.g. Avatar3D) can drive a mouth blendshape.
 *
 * Only one utterance plays at a time; calling speak() while speaking
 * cancels the previous clip cleanly.
 */
export function useAvatarSpeech() {
  const amplitudeRef = useRef(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const clipRef = useRef<TtsClip | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Route audio to the speaker even if the device is on silent.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPlayback = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.remove();
      } catch {}
      playerRef.current = null;
    }
    clipRef.current = null;
    amplitudeRef.current = 0;
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setError(null);
      setStatus("loading");
      // Cancel any in-flight speech before kicking off a new one.
      stopPlayback();

      try {
        const clip = await fetchTtsClip(text);
        clipRef.current = clip;

        const dataUri = `data:${clip.mime};base64,${clip.audio}`;
        const player = createAudioPlayer({ uri: dataUri });
        playerRef.current = player;

        setStatus("speaking");
        startedAtRef.current = Date.now();
        player.play();

        // Drive amplitudeRef on a rAF loop so the avatar's render loop
        // sees fresh values. We use wall-clock elapsed instead of
        // player.currentTime because polling currentTime from expo-audio
        // can lag a few hundred ms on Android.
        const tick = () => {
          if (!playerRef.current || !clipRef.current) return;
          const elapsedMs = Date.now() - startedAtRef.current;
          const env = clipRef.current.envelope;
          const win = clipRef.current.envelopeWindowMs;
          if (elapsedMs >= clipRef.current.durationMs) {
            amplitudeRef.current = 0;
            setStatus("idle");
            return;
          }
          const idx = Math.min(env.length - 1, Math.floor(elapsedMs / win));
          // Mild smoothing so consecutive envelope buckets don't jitter.
          amplitudeRef.current = amplitudeRef.current * 0.4 + env[idx] * 0.6;
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "speak failed";
        setError(msg);
        setStatus("error");
        stopPlayback();
        throw e;
      }
    },
    [stopPlayback]
  );

  return { amplitudeRef, status, error, speak, stop: stopPlayback };
}

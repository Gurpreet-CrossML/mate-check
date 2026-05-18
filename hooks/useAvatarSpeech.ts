import { fetchTtsClip, TtsClip } from '@/lib/api';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'loading' | 'speaking' | 'error';

/**
 * Fetches cloud TTS audio + amplitude envelope, plays the audio,
 * and continuously updates amplitudeRef so the avatar's render loop
 * can drive a mouth blendshape in sync with the waveform.
 */
export function useAvatarSpeech() {
  const amplitudeRef = useRef(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const clipRef = useRef<TtsClip | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => {
      stopPlaybackImpl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPlaybackImpl = () => {
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
  };

  const stop = useCallback(() => {
    stopPlaybackImpl();
    setStatus('idle');
  }, []);

  const speak = useCallback(async (text: string, opts?: { onStart?: () => void }) => {
    if (!text.trim()) return;
    setError(null);
    setStatus('loading');
    stopPlaybackImpl();

    try {
      const clip = await fetchTtsClip(text);
      clipRef.current = clip;

      const dataUri = `data:${clip.mime};base64,${clip.audio}`;
      const player = createAudioPlayer({ uri: dataUri });
      playerRef.current = player;

      setStatus('speaking');
      startedAtRef.current = Date.now();
      player.play();
      opts?.onStart?.();

      const tick = () => {
        const clip = clipRef.current;
        if (!playerRef.current || !clip) return;
        const elapsedMs = Date.now() - startedAtRef.current;
        if (elapsedMs >= clip.durationMs) {
          amplitudeRef.current = 0;
          setStatus('idle');
          return;
        }
        const idx = Math.min(clip.envelope.length - 1, Math.floor(elapsedMs / clip.envelopeWindowMs));
        // Mild smoothing so consecutive buckets don't jitter.
        amplitudeRef.current = amplitudeRef.current * 0.4 + clip.envelope[idx] * 0.6;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'speak failed';
      console.warn('[useAvatarSpeech]', msg);
      setError(msg);
      setStatus('error');
      stopPlaybackImpl();
      throw e;
    }
  }, []);

  return { amplitudeRef, status, error, speak, stop };
}

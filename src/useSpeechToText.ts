/**
 * No-op stub for the mic-button speech-to-text hook.
 *
 * The real implementation used `expo-speech-recognition`, which requires
 * a config plugin and therefore a custom dev client. To unblock iOS
 * Simulator rendering we switched to plain Expo Go, which doesn't ship
 * that module. ChatScreen treats this hook as if the mic is always idle
 * and hides the mic button.
 *
 * When you eventually move back to a custom dev client (e.g. for a real
 * device build), restore the original useSpeechToText implementation
 * from git history.
 */
export function useSpeechToText() {
  return {
    isListening: false,
    transcript: "",
    error: null as string | null,
    start: () => undefined,
    stop: () => undefined,
  };
}

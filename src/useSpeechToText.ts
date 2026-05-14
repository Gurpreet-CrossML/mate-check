import { useCallback, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

export function useSpeechToText() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent("result", (event: any) => {
    const text = event?.results?.[0]?.transcript;
    if (typeof text === "string") setTranscript(text);
  });

  useSpeechRecognitionEvent("error", (event: any) => {
    setError(event?.error ?? "speech recognition error");
    setIsListening(false);
  });

  const start = useCallback(async () => {
    setError(null);
    setTranscript("");
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm?.granted) {
        setError("Microphone permission not granted");
        return;
      }
      await ExpoSpeechRecognitionModule.start({
        lang: "en-AU",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start mic";
      console.warn("[useSpeechToText] start failed:", msg);
      setError(msg);
    }
  }, []);

  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      console.warn("[useSpeechToText] stop failed:", e);
    }
  }, []);

  return { isListening, transcript, error, start, stop };
}

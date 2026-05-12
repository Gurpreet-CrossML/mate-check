import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

type State = {
  isListening: boolean;
  transcript: string;
  error: string | null;
};

export function useSpeechToText() {
  const [state, setState] = useState<State>({
    isListening: false,
    transcript: "",
    error: null,
  });
  const finalRef = useRef("");

  useSpeechRecognitionEvent("start", () =>
    setState((s) => ({ ...s, isListening: true, error: null }))
  );

  useSpeechRecognitionEvent("end", () =>
    setState((s) => ({ ...s, isListening: false }))
  );

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results?.[0]?.transcript ?? "";
    if (event.isFinal) finalRef.current = text;
    setState((s) => ({ ...s, transcript: text }));
  });

  useSpeechRecognitionEvent("error", (event) => {
    setState((s) => ({
      ...s,
      isListening: false,
      error: event.message || event.error || "Speech recognition failed",
    }));
  });

  const start = useCallback(async () => {
    finalRef.current = "";
    setState({ isListening: false, transcript: "", error: null });

    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setState((s) => ({ ...s, error: "Microphone permission denied" }));
      return;
    }

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: false,
      addsPunctuation: true,
    });
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  useEffect(
    () => () => {
      ExpoSpeechRecognitionModule.abort();
    },
    []
  );

  return { ...state, start, stop };
}

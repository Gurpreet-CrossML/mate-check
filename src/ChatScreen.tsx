import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { AvatarVideo } from "./AvatarVideo";
import { fetchChatReply, fetchClipVideoUrl, type ChatMessage } from "./api";
import { useSpeechToText } from "./useSpeechToText";

type Stage = "idle" | "thinking" | "rendering" | "ready" | "error";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "Ready when you are.",
  thinking: "Thinking…",
  rendering: "Rendering avatar…",
  ready: "",
  error: "Something went wrong.",
};

export function ChatScreen() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const speech = useSpeechToText();

  useEffect(() => {
    if (speech.transcript) setInput(speech.transcript);
  }, [speech.transcript]);

  useEffect(() => {
    if (speech.error) setError(speech.error);
  }, [speech.error]);

  const isBusy = stage === "thinking" || stage === "rendering";
  const canSend = !isBusy && input.trim().length > 0;

  async function handleSend() {
    const userMessage = input.trim();
    if (!userMessage) return;

    setError(null);
    setVideoUrl(null);
    setReply(null);
    setInput("");
    setStage("thinking");

    try {
      const assistantReply = await fetchChatReply(userMessage, history);
      setReply(assistantReply);
      setHistory((h) => [
        ...h,
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantReply },
      ]);

      setStage("rendering");
      const url = await fetchClipVideoUrl(assistantReply, ({ attempt, status }) => {
        if (__DEV__) console.log(`[clip] poll #${attempt} status=${status}`);
      });
      setVideoUrl(url);
      setStage("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStage("error");
    }
  }

  function toggleMic() {
    if (speech.isListening) speech.stop();
    else speech.start();
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="light" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
          <View>
            <Text className="text-2xl font-bold text-white">mate-check</Text>
            <Text className="text-xs text-muted">talking avatar · POC</Text>
          </View>
          <View className="rounded-full bg-surface px-3 py-1">
            <Text className="text-[11px] text-accent">
              {STAGE_LABEL[stage] || "Ready"}
            </Text>
          </View>
        </View>

        <View className="mx-5 mb-3 aspect-square overflow-hidden rounded-3xl bg-surface">
          {videoUrl ? (
            <AvatarVideo videoUrl={videoUrl} />
          ) : (
            <View className="flex-1 items-center justify-center">
              {isBusy ? (
                <View className="items-center gap-3">
                  <ActivityIndicator size="large" color="#A78BFA" />
                  <Text className="text-sm text-muted">
                    {STAGE_LABEL[stage]}
                  </Text>
                </View>
              ) : (
                <Text className="px-6 text-center text-base text-muted">
                  Ask anything. The avatar will reply in a short clip.
                </Text>
              )}
            </View>
          )}
        </View>

        <ScrollView
          className="mx-5 mb-3"
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          {reply ? (
            <View className="rounded-2xl bg-surface p-4">
              <Text className="mb-1 text-[11px] uppercase tracking-wider text-muted">
                Avatar
              </Text>
              <Text className="text-[15px] leading-5 text-white">{reply}</Text>
            </View>
          ) : null}
          {error ? (
            <View className="mt-2 rounded-2xl bg-red-500/10 p-3">
              <Text className="text-sm text-red-300">{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View className="flex-row items-end gap-2 px-5 pb-5">
          <View className="flex-1 flex-row items-center rounded-2xl bg-surface px-3">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={
                speech.isListening ? "Listening…" : "Ask the avatar…"
              }
              placeholderTextColor="#6B7280"
              multiline
              editable={!isBusy}
              className="min-h-[44px] flex-1 py-3 text-base text-white"
            />
            <Pressable
              onPress={toggleMic}
              disabled={isBusy}
              className={`ml-2 h-10 w-10 items-center justify-center rounded-full ${
                speech.isListening ? "bg-red-500" : "bg-accent/20"
              }`}
            >
              <Text className="text-lg">{speech.isListening ? "■" : "🎙"}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            className={`h-12 items-center justify-center rounded-2xl px-5 ${
              canSend ? "bg-accent" : "bg-surface"
            }`}
          >
            {isBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                className={`text-base font-semibold ${
                  canSend ? "text-bg" : "text-muted"
                }`}
              >
                Send
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

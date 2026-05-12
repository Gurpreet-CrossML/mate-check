import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { AvatarVideo } from "./AvatarVideo";
import {
  fetchChatReply,
  fetchClipVideoUrl,
  type ChatMessage,
} from "./api";
import { useSpeechToText } from "./useSpeechToText";

const GREETING =
  "G'day mate, welcome to MateCheck! Think of me as your mate in your pocket — here to help you stay close to the people who care about you. Got something on your mind? Let's have a yarn.";

type Stage = "idle" | "greeting" | "thinking" | "rendering" | "ready" | "error";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "Ready",
  greeting: "Saying hi…",
  thinking: "Thinking…",
  rendering: "Rendering…",
  ready: "Ready",
  error: "Error",
};

type Bubble = ChatMessage & { id: string };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatScreen() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Bubble[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<Bubble>>(null);
  const speech = useSpeechToText();
  const greetedRef = useRef(false);

  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    void runGreeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (speech.transcript) setInput(speech.transcript);
  }, [speech.transcript]);

  useEffect(() => {
    if (speech.error) setError(speech.error);
  }, [speech.error]);

  useEffect(() => {
    const userMessages = history.filter((m) => m.role === "user");
    if (userMessages.length > 0) {
      requestAnimationFrame(() =>
        listRef.current?.scrollToEnd({ animated: true })
      );
    }
  }, [history.length]);

  async function runGreeting() {
    setStage("greeting");
    setHistory([{ id: uid(), role: "assistant", content: GREETING }]);
    try {
      const url = await fetchClipVideoUrl(
        GREETING,
        ({ attempt, status }) => {
          if (__DEV__) console.log(`[greeting] poll #${attempt} status=${status}`);
        },
        { intervalMs: 1000 }
      );
      setVideoUrl(url);
      setStage("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load greeting");
      setStage("error");
    }
  }

  const isBusy =
    stage === "thinking" || stage === "rendering" || stage === "greeting";
  const canSend = !isBusy && input.trim().length > 0;

  async function handleSend() {
    const userMessage = input.trim();
    if (!userMessage) return;

    setError(null);
    setInput("");

    const userBubble: Bubble = { id: uid(), role: "user", content: userMessage };
    setHistory((h) => [...h, userBubble]);
    setStage("thinking");

    try {
      const contextHistory: ChatMessage[] = history.map(({ role, content }) => ({
        role,
        content,
      }));
      const assistantReply = await fetchChatReply(userMessage, contextHistory);

      setHistory((h) => [
        ...h,
        { id: uid(), role: "assistant", content: assistantReply },
      ]);

      setStage("rendering");
      setVideoUrl(null);
      const url = await fetchClipVideoUrl(
        assistantReply,
        ({ attempt, status }) => {
          if (__DEV__) console.log(`[clip] poll #${attempt} status=${status}`);
        },
        { intervalMs: 1000 }
      );
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
          <View className="flex-row items-center gap-2">
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand">
              <Text className="text-base font-extrabold text-bg">👍</Text>
            </View>
            <View>
              <Text className="text-2xl font-extrabold text-brand">
                MateCheck
              </Text>
              <Text className="text-[11px] text-muted">your mate, on call</Text>
            </View>
          </View>
          <View className="rounded-full bg-surfaceAlt px-3 py-1">
            <Text className="text-[11px] font-semibold text-brand">
              {STAGE_LABEL[stage]}
            </Text>
          </View>
        </View>

        <View className="mx-5 mb-3 aspect-square overflow-hidden rounded-3xl border border-brand/20 bg-surface">
          {videoUrl ? (
            <AvatarVideo videoUrl={videoUrl} />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Image
                source={require("../assets/mascot.png")}
                resizeMode="contain"
                style={{ width: "80%", height: "80%", opacity: isBusy ? 0.5 : 1 }}
              />
              {isBusy ? (
                <View className="absolute inset-0 items-center justify-center gap-2">
                  <ActivityIndicator size="large" color="#F5C518" />
                  <Text className="text-sm font-medium text-brand">
                    {stage === "greeting"
                      ? "Saying hello…"
                      : stage === "thinking"
                      ? "Thinking…"
                      : "Rendering avatar (≈10–20s)…"}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <FlatList
          ref={listRef}
          data={history.filter((m) => m.role === "user")}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
          renderItem={({ item }) => (
            <View className="mb-2 max-w-[85%] self-end rounded-2xl bg-brand px-3 py-2">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-bg/70">
                You
              </Text>
              <Text className="mt-0.5 text-[15px] leading-5 text-bg">
                {item.content}
              </Text>
            </View>
          )}
          ListFooterComponent={
            error ? (
              <View className="mt-2 rounded-2xl bg-red-500/10 p-3">
                <Text className="text-sm text-red-300">{error}</Text>
              </View>
            ) : null
          }
          className="mx-0 mb-3 flex-1"
        />

        <View className="flex-row items-end gap-2 px-5 pb-5">
          <View className="flex-1 flex-row items-center rounded-2xl bg-surfaceAlt px-3">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={
                speech.isListening ? "Listening…" : "Ask your mate…"
              }
              placeholderTextColor="#90A097"
              multiline
              editable={!isBusy}
              className="min-h-[44px] flex-1 py-3 text-base text-text"
            />
            <Pressable
              onPress={toggleMic}
              disabled={isBusy}
              className={`ml-2 h-10 w-10 items-center justify-center rounded-full ${
                speech.isListening ? "bg-red-500" : "bg-brand/20"
              }`}
            >
              <Text className="text-lg">{speech.isListening ? "■" : "🎙"}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            className={`h-12 items-center justify-center rounded-2xl px-5 ${
              canSend ? "bg-brand" : "bg-surfaceAlt"
            }`}
          >
            {isBusy ? (
              <ActivityIndicator color="#0E1A14" />
            ) : (
              <Text
                className={`text-base font-bold ${
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

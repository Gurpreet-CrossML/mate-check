import { ChatInput } from '@/components/ChatInput';
import { ChatMessage, ChatOverlay } from '@/components/ChatOverlay';
import { AvatarAction, ModelViewer, ModelViewerHandle } from '@/components/ModelViewer';
import { useAvatarSpeech } from '@/hooks/useAvatarSpeech';
import { sendChat } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const GREETING =
  "G'day mate, welcome to MateCheck! Think of me as your mate in your pocket — here to help you stay close to the people who care about you. Got something on your mind? Let's have a yarn.";

const QUICK_ACTIONS: { name: AvatarAction; emoji: string; label: string }[] = [
  { name: 'wave', emoji: '👋', label: 'Wave' },
  { name: 'dance', emoji: '💃', label: 'Dance' },
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messageIdRef = useRef(0);
  const greetedRef = useRef(false);
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const modelRef = useRef<ModelViewerHandle>(null);

  const { amplitudeRef, speak } = useAvatarSpeech();

  const generateId = useCallback(() => String(++messageIdRef.current), []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: e.endCoordinates.height,
        duration: e.duration ?? 250,
        useNativeDriver: true,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: e?.duration ?? 250,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  const showAssistant = useCallback(
    (content: string) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content === content) return prev;
        return [...prev, { id: generateId(), role: 'assistant', content }];
      });
    },
    [generateId]
  );

  const speakAndShow = useCallback(
    async (text: string) => {
      try {
        await speak(text, { onStart: () => showAssistant(text) });
      } catch {
        showAssistant(text);
      }
    },
    [speak, showAssistant]
  );

  const handleModelReady = useCallback(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    setTimeout(() => {
      speakAndShow(GREETING);
    }, 400);
  }, [speakAndShow]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
      };
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const reply = await sendChat(text, history);
        speakAndShow(reply);
      } catch (error) {
        console.error('Chat request failed:', error);
        showAssistant('Sorry, I had trouble reaching the server.');
      } finally {
        setIsLoading(false);
      }
    },
    [generateId, messages, showAssistant, speakAndShow]
  );

  const handleAction = useCallback((name: AvatarAction) => {
    modelRef.current?.playAction(name);
  }, []);

  return (
    <Pressable style={styles.container} onPress={() => Keyboard.dismiss()}>
      <ModelViewer ref={modelRef} onReady={handleModelReady} amplitudeRef={amplitudeRef} />

      <Animated.View
        style={[
          styles.overlayContainer,
          { transform: [{ translateY: Animated.multiply(keyboardOffset, -1) }] },
        ]}
        pointerEvents="box-none"
      >
        <ChatOverlay messages={messages} />

        <View style={styles.actionsRow}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity
              key={a.name}
              style={styles.actionButton}
              onPress={() => handleAction(a.name)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionEmoji}>{a.emoji}</Text>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  overlayContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(40, 38, 36, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  actionEmoji: {
    fontSize: 15,
  },
  actionLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});

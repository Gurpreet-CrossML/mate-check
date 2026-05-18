import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatOverlayProps {
  messages: ChatMessage[];
}

export const ChatOverlay: React.FC<ChatOverlayProps> = ({ messages }) => {
  const displayMessages = messages.slice(-2);

  if (displayMessages.length === 0) return null;

  return (
    <View style={styles.container}>
      {displayMessages.map((msg) => (
        <View
          key={msg.id}
          style={[
            styles.bubble,
            msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text style={styles.messageText} numberOfLines={3}>
            {msg.content}
          </Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  bubble: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#E89070',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(40, 38, 36, 0.95)',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#ffffff',
    fontWeight: '500',
  },
});

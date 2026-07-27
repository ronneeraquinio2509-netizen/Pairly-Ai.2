import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, ChatMessage, api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { streamChat } from "@/src/chat-stream";
import { useToast } from "@/src/components/toast";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

const STARTERS = [
  "What can I make with chicken thighs and lemon?",
  "What wine suits a mushroom risotto?",
  "How do I balance a dish that's too acidic?",
  "Give me a cheese board for four people",
];

type Bubble = { id: string; role: "user" | "assistant"; content: string };

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [messages, setMessages] = useState<Bubble[] | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<FlatList<Bubble>>(null);

  const load = useCallback(async () => {
    try {
      const history: ChatMessage[] = await api.chatHistory();
      setMessages(history.map((m) => ({ id: m.id, role: m.role, content: m.content })));
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || streaming) return;
    setDraft("");
    const userBubble: Bubble = { id: `u-${Date.now()}`, role: "user", content: message };
    const replyId = `a-${Date.now()}`;
    setMessages((prev) => [...(prev ?? []), userBubble, { id: replyId, role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      await streamChat(message, (chunk) => {
        setMessages((prev) =>
          (prev ?? []).map((m) => (m.id === replyId ? { ...m, content: m.content + chunk } : m)),
        );
      });
    } catch (e) {
      const isQuota = e instanceof ApiError && e.status === 402;
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== replyId));
      if (isQuota) router.push("/paywall");
      else toast.show(e instanceof ApiError ? e.message : "Pairly couldn't answer right now", "error");
    } finally {
      setStreaming(false);
      refresh();
    }
  };

  const clear = async () => {
    setMessages([]);
    try {
      await api.clearChat();
      toast.show("Conversation cleared", "info");
    } catch {
      load();
    }
  };

  const empty = messages !== null && messages.length === 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="chat-back-button" onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{user?.role === "chef" ? "SOUS CHEF" : "KITCHEN COMPANION"}</Text>
          <Text style={styles.title}>Ask Pairly</Text>
        </View>
        <Pressable testID="chat-clear-button" onPress={clear} hitSlop={8} style={styles.iconBtn}>
          <Feather name="trash-2" size={18} color={colors.muted} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "translate-with-padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {messages === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : empty ? (
          <View testID="chat-empty-state" style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Feather name="message-circle" size={22} color={colors.brand} />
            </View>
            <Text style={styles.emptyTitle}>Talk through what you're cooking</Text>
            <Text style={styles.emptyBody}>
              Ask about substitutions, balance, technique or what to pour alongside — Pairly answers in your
              {user?.role === "chef" ? " chef" : " home cook"} voice.
            </Text>
            <View style={styles.starters}>
              {STARTERS.map((s, i) => (
                <Pressable
                  key={s}
                  testID={`chat-starter-${i}`}
                  onPress={() => send(s)}
                  style={styles.starter}
                >
                  <Text style={styles.starterText}>{s}</Text>
                  <Feather name="arrow-up-right" size={14} color={colors.brand} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            testID="chat-message-list"
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View
                testID={`chat-bubble-${item.role}`}
                style={[styles.bubble, item.role === "user" ? styles.bubbleUser : styles.bubbleAi]}
              >
                {item.role === "assistant" && !item.content ? (
                  <ActivityIndicator color={colors.brand} size="small" />
                ) : (
                  <Text style={[styles.bubbleText, item.role === "user" && styles.bubbleTextUser]}>
                    {item.content}
                  </Text>
                )}
              </View>
            )}
          />
        )}

        <View style={[styles.composer, { paddingBottom: spacing.md }]}>
          <TextInput
            testID="chat-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about a pairing, swap or technique…"
            placeholderTextColor="#B3AEA6"
            style={styles.input}
            multiline
            onSubmitEditing={() => send(draft)}
          />
          <Pressable
            testID="chat-send-button"
            onPress={() => send(draft)}
            disabled={streaming || !draft.trim()}
            style={[styles.sendBtn, (streaming || !draft.trim()) && { opacity: 0.45 }]}
          >
            {streaming ? (
              <ActivityIndicator color={colors.onBrand} size="small" />
            ) : (
              <Feather name="arrow-up" size={19} color={colors.onBrand} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  kicker: { fontFamily: fonts.text, fontSize: 10, letterSpacing: 2, color: colors.brand, fontWeight: "700" },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface, marginTop: spacing.xs },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xxl },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: type.xxl, color: colors.onSurface, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, lineHeight: 21 },
  starters: { marginTop: spacing.xl, gap: spacing.sm },
  starter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  starterText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface },
  listContent: { padding: spacing.lg, gap: spacing.md },
  bubble: { maxWidth: "88%", borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: radius.sm },
  bubbleAi: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleText: { fontFamily: fonts.text, fontSize: type.base, lineHeight: 21, color: colors.onSurface },
  bubbleTextUser: { color: colors.onBrand },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontFamily: fonts.text,
    fontSize: type.lg,
    color: colors.onSurface,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});

import { useEffect, useRef, useState, useMemo } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { humanize } from "@/src/format";

type Msg = { role: "user" | "assistant"; content: string };
const STARTERS = [
  "Explain differentiation from first principles",
  "Give me a similar problem to solve",
  "Summarise Newton's laws in 3 bullets",
  "Create a 30-min study plan for me",
];

export default function AITutor() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ seed?: string }>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionId = useMemo(() => `chat_${user?.user_id ?? "guest"}_${Date.now()}`, [user]);
  const scrollRef = useRef<ScrollView>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (params.seed && !seededRef.current && !busy) {
      seededRef.current = true;
      send(String(params.seed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.seed]);

  const send = async (override?: string) => {
    const content = (override ?? text).trim();
    if (!content || busy) return;
    setMsgs((m) => [...m, { role: "user", content }]);
    setText("");
    setBusy(true);
    try {
      const r = await api<{ reply: string }>("/ai/chat", {
        method: "POST",
        body: { session_id: sessionId, message: content },
      });
      setMsgs((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${e.message || "AI unavailable"}` }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="ai-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>GC AI Assistant</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <View style={styles.dot} />
            <Text style={styles.online}>Online · Claude Haiku 4.5</Text>
          </View>
        </View>
        <View style={styles.aiAvatar}><Ionicons name="sparkles" size={18} color="#fff" /></View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="translate-with-padding"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          testID="chat-scroll"
        >
          {msgs.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="sparkles" size={28} color={theme.brandPrimary} />
              <Text style={styles.emptyT}>Ask me anything academic</Text>
              <Text style={styles.emptyS}>Math steps · concept explanations · study plans</Text>
              <View style={styles.starters}>
                {STARTERS.map((s) => (
                  <Pressable
                    key={s}
                    testID={`starter-${s.slice(0, 12)}`}
                    style={styles.starter}
                    onPress={() => send(s)}
                  >
                    <Text style={styles.starterTxt}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {msgs.map((m, i) => (
            <View
              key={i}
              testID={`msg-${i}`}
              style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}
            >
              <Text style={m.role === "user" ? styles.userTxt : styles.aiTxt}>
                {m.role === "user" ? m.content : humanize(m.content)}
              </Text>
            </View>
          ))}
          {busy && (
            <View style={[styles.bubble, styles.aiBubble]} testID="typing">
              <ActivityIndicator color={theme.brandPrimary} />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputWrap}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder="Ask GC AI..."
            placeholderTextColor={theme.onSurfaceMuted}
            style={styles.input}
            multiline
          />
          <Pressable style={styles.sendBtn} onPress={() => send()} testID="send-btn" disabled={busy}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: spacing.lg, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: theme.divider,
  },
  title: { fontSize: 18, fontWeight: "800", color: theme.brand },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.success },
  online: { fontSize: 12, color: theme.onSurfaceMuted },
  aiAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  empty: { alignItems: "center", padding: spacing.xl, gap: 6 },
  emptyT: { fontWeight: "800", fontSize: 18, color: theme.onSurface, marginTop: 6 },
  emptyS: { color: theme.onSurfaceMuted, marginBottom: spacing.md },
  starters: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  starter: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
  },
  starterTxt: { color: theme.onSurface, fontSize: 12 },
  bubble: { maxWidth: "85%", padding: spacing.md, borderRadius: radii.md },
  userBubble: { alignSelf: "flex-end", backgroundColor: theme.brand },
  aiBubble: { alignSelf: "flex-start", backgroundColor: "#fff", ...shadow1 },
  userTxt: { color: "#fff", fontSize: 15, lineHeight: 21 },
  aiTxt: { color: theme.onSurface, fontSize: 15, lineHeight: 21 },
  inputWrap: {
    flexDirection: "row", padding: spacing.md, gap: spacing.sm, alignItems: "flex-end",
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: theme.divider,
  },
  input: {
    flex: 1, backgroundColor: theme.surface, borderRadius: radii.md, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 15, color: theme.onSurface, maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: theme.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
});

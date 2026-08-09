// import { useEffect, useRef, useState, useMemo } from "react";
// import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { KeyboardAvoidingView } from "react-native-keyboard-controller";
// import { Ionicons } from "@expo/vector-icons";
// import { useLocalSearchParams } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { api } from "@/src/api";
// import { useAuth } from "@/src/auth";
// import { humanize } from "@/src/format";

// type Msg = { role: "user" | "assistant"; content: string };
// const STARTERS = [
//   "Explain differentiation from first principles",
//   "Give me a similar problem to solve",
//   "Summarise Newton's laws in 3 bullets",
//   "Create a 30-min study plan for me",
// ];

// export default function AITutor() {
//   const { user } = useAuth();
//   const params = useLocalSearchParams<{ seed?: string }>();
//   const [msgs, setMsgs] = useState<Msg[]>([]);
//   const [text, setText] = useState("");
//   const [busy, setBusy] = useState(false);
//   const sessionId = useMemo(() => `chat_${user?.user_id ?? "guest"}_${Date.now()}`, [user]);
//   const scrollRef = useRef<ScrollView>(null);
//   const seededRef = useRef(false);

//   useEffect(() => {
//     if (params.seed && !seededRef.current && !busy) {
//       seededRef.current = true;
//       send(String(params.seed));
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [params.seed]);

//   const send = async (override?: string) => {
//     const content = (override ?? text).trim();
//     if (!content || busy) return;
//     setMsgs((m) => [...m, { role: "user", content }]);
//     setText("");
//     setBusy(true);
//     try {
//       const r = await api<{ reply: string }>("/ai/chat", {
//         method: "POST",
//         body: { session_id: sessionId, message: content },
//       });
//       setMsgs((m) => [...m, { role: "assistant", content: r.reply }]);
//     } catch (e: any) {
//       setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${e.message || "AI unavailable"}` }]);
//     } finally {
//       setBusy(false);
//       setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
//     }
//   };

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="ai-screen">
//       <View style={styles.header}>
//         <View>
//           <Text style={styles.title}>GC AI Assistant</Text>
//           <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
//             <View style={styles.dot} />
//             <Text style={styles.online}>Online · Claude Haiku 4.5</Text>
//           </View>
//         </View>
//         <View style={styles.aiAvatar}><Ionicons name="sparkles" size={18} color="#fff" /></View>
//       </View>

//       <KeyboardAvoidingView
//         style={{ flex: 1 }}
//         behavior="translate-with-padding"
//         keyboardVerticalOffset={0}
//       >
//         <ScrollView
//           ref={scrollRef}
//           style={{ flex: 1 }}
//           contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
//           testID="chat-scroll"
//         >
//           {msgs.length === 0 && (
//             <View style={styles.empty}>
//               <Ionicons name="sparkles" size={28} color={theme.brandPrimary} />
//               <Text style={styles.emptyT}>Ask me anything academic</Text>
//               <Text style={styles.emptyS}>Math steps · concept explanations · study plans</Text>
//               <View style={styles.starters}>
//                 {STARTERS.map((s) => (
//                   <Pressable
//                     key={s}
//                     testID={`starter-${s.slice(0, 12)}`}
//                     style={styles.starter}
//                     onPress={() => send(s)}
//                   >
//                     <Text style={styles.starterTxt}>{s}</Text>
//                   </Pressable>
//                 ))}
//               </View>
//             </View>
//           )}
//           {msgs.map((m, i) => (
//             <View
//               key={i}
//               testID={`msg-${i}`}
//               style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}
//             >
//               <Text style={m.role === "user" ? styles.userTxt : styles.aiTxt}>
//                 {m.role === "user" ? m.content : humanize(m.content)}
//               </Text>
//             </View>
//           ))}
//           {busy && (
//             <View style={[styles.bubble, styles.aiBubble]} testID="typing">
//               <ActivityIndicator color={theme.brandPrimary} />
//             </View>
//           )}
//         </ScrollView>

//         <View style={styles.inputWrap}>
//           <TextInput
//             testID="chat-input"
//             value={text}
//             onChangeText={setText}
//             placeholder="Ask GC AI..."
//             placeholderTextColor={theme.onSurfaceMuted}
//             style={styles.input}
//             multiline
//           />
//           <Pressable style={styles.sendBtn} onPress={() => send()} testID="send-btn" disabled={busy}>
//             <Ionicons name="send" size={18} color="#fff" />
//           </Pressable>
//         </View>
//       </KeyboardAvoidingView>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   header: {
//     flexDirection: "row", justifyContent: "space-between", alignItems: "center",
//     padding: spacing.lg, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: theme.divider,
//   },
//   title: { fontSize: 18, fontWeight: "800", color: theme.brand },
//   dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.success },
//   online: { fontSize: 12, color: theme.onSurfaceMuted },
//   aiAvatar: {
//     width: 40, height: 40, borderRadius: 20, backgroundColor: theme.brandPrimary,
//     alignItems: "center", justifyContent: "center",
//   },
//   empty: { alignItems: "center", padding: spacing.xl, gap: 6 },
//   emptyT: { fontWeight: "800", fontSize: 18, color: theme.onSurface, marginTop: 6 },
//   emptyS: { color: theme.onSurfaceMuted, marginBottom: spacing.md },
//   starters: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
//   starter: {
//     backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border,
//     paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
//   },
//   starterTxt: { color: theme.onSurface, fontSize: 12 },
//   bubble: { maxWidth: "85%", padding: spacing.md, borderRadius: radii.md },
//   userBubble: { alignSelf: "flex-end", backgroundColor: theme.brand },
//   aiBubble: { alignSelf: "flex-start", backgroundColor: "#fff", ...shadow1 },
//   userTxt: { color: "#fff", fontSize: 15, lineHeight: 21 },
//   aiTxt: { color: theme.onSurface, fontSize: 15, lineHeight: 21 },
//   inputWrap: {
//     flexDirection: "row", padding: spacing.md, gap: spacing.sm, alignItems: "flex-end",
//     backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: theme.divider,
//   },
//   input: {
//     flex: 1, backgroundColor: theme.surface, borderRadius: radii.md, paddingHorizontal: 14,
//     paddingVertical: 10, fontSize: 15, color: theme.onSurface, maxHeight: 120,
//   },
//   sendBtn: {
//     width: 44, height: 44, borderRadius: 22, backgroundColor: theme.brandPrimary,
//     alignItems: "center", justifyContent: "center",
//   },
// });





































import { useEffect, useRef, useState, useMemo } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView, Platform, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api, API_BASE, readToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { humanize } from "@/src/format";

type Msg = { role: "user" | "assistant"; content: string };
const STARTERS = [
  "Explain differentiation from first principles",
  "Give me a similar problem to solve",
  "Summarise Newton's laws in 3 bullets",
  "Create a 30-min study plan for me",
];

// Typing indicator component with animated dots
function TypingIndicator() {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const dots = ".".repeat(dotCount) + " ".repeat(3 - dotCount);

  return (
    <View style={[styles.bubble, styles.aiBubble, styles.typingContainer]}>
      <Text style={styles.aiTxt}>AI is typing{dots}</Text>
    </View>
  );
}

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
  }, [params.seed]);

  const send = async (override?: string) => {
    const content = (override ?? text).trim();
    if (!content || busy) return;

    setMsgs((m) => [...m, { role: "user", content }]);
    setText("");
    setBusy(true);

    try {
      console.log(`[AI] Sending message on ${Platform.OS}:`, content);

      const token = await readToken();
      console.log(`[AI] Token exists:`, !!token);

      // Use the main /ai/chat endpoint which has the full AI capabilities
      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: content,
          subject: "General Mathematics",
          current_problem: content,
        }),
      });

      console.log(`[AI] Response status:`, response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[AI] Error response:`, errorText);
        if (response.status === 401) {
          throw new Error("Authentication required. Please log in again.");
        }
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      // For streaming response, we need to read the stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.delta) {
                  fullReply += data.delta;
                  // Update the message in real-time
                  setMsgs((m) => {
                    const last = m[m.length - 1];
                    if (last && last.role === "assistant") {
                      const updated = [...m];
                      updated[updated.length - 1] = { ...last, content: fullReply };
                      return updated;
                    } else {
                      return [...m, { role: "assistant", content: fullReply }];
                    }
                  });
                }
                if (data.done) {
                  console.log("Stream complete");
                }
              } catch (e) {
                // Skip non-JSON lines
              }
            }
          }
        }
      }

      // If no streaming data was received, try the non-streaming endpoint
      if (!fullReply) {
        console.log("[AI] No streaming data, trying /ai/explain");
        const fallbackResponse = await fetch(`${API_BASE}/ai/explain`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            session_id: sessionId,
            message: content,
            subject: "General Mathematics",
            current_problem: content,
          }),
        });

        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          let reply = fallbackData.reply || fallbackData.answer || "I couldn't generate a response. Please try again.";
          if (typeof reply === 'object') {
            reply = JSON.stringify(reply);
          }
          // Check if we got a real answer or a safety response
          if (reply.includes("User Safety: safe")) {
            throw new Error("The AI service returned a safety check response. Please try rephrasing your question.");
          }
          setMsgs((m) => [...m, { role: "assistant", content: reply }]);
        } else {
          throw new Error("Failed to get response from AI service");
        }
      }

    } catch (e: any) {
      console.error("[AI] Chat error:", e);
      let errorMsg = "AI unavailable. Please try again.";

      if (e.message?.includes("401") || e.message?.includes("Authentication") || e.message?.includes("Missing token")) {
        errorMsg = "Your session has expired. Please log in again.";
      } else if (e.message?.includes("safety")) {
        errorMsg = "I couldn't process that request. Please try rephrasing your question.";
      } else if (e.message) {
        errorMsg = e.message;
      }

      setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${errorMsg}` }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const renderMessage = (content: string, role: "user" | "assistant") => {
    if (role === "assistant" && typeof content === 'string') {
      try {
        // Check if it's a safety response
        if (content.includes("User Safety: safe")) {
          return "I couldn't process that request. Please try rephrasing your question.";
        }
        return humanize ? humanize(content) : content;
      } catch (e) {
        return content;
      }
    }
    return content;
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="ai-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>GC AI Assistant</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <View style={styles.dot} />
            <Text style={styles.online}>Online · AI Tutor</Text>
          </View>
        </View>
        <View style={styles.aiAvatar}>
          <Ionicons name="sparkles" size={18} color="#fff" />
        </View>
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
                {m.role === "user" ? m.content : renderMessage(m.content, m.role)}
              </Text>
            </View>
          ))}
          {busy && <TypingIndicator />}
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
  typingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    fontSize: 24,
    fontWeight: "bold",
    color: theme.brandPrimary,
    marginLeft: -2,
  },
});
// // import { useEffect, useRef, useState, useMemo } from "react";
// // import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView } from "react-native";
// // import { SafeAreaView } from "react-native-safe-area-context";
// // import { KeyboardAvoidingView } from "react-native-keyboard-controller";
// // import { Ionicons } from "@expo/vector-icons";
// // import { useLocalSearchParams } from "expo-router";
// // import { theme, spacing, radii, shadow1 } from "@/src/theme";
// // import { api } from "@/src/api";
// // import { useAuth } from "@/src/auth";
// // import { humanize } from "@/src/format";

// // type Msg = { role: "user" | "assistant"; content: string };
// // const STARTERS = [
// //   "Explain differentiation from first principles",
// //   "Give me a similar problem to solve",
// //   "Summarise Newton's laws in 3 bullets",
// //   "Create a 30-min study plan for me",
// // ];

// // export default function AITutor() {
// //   const { user } = useAuth();
// //   const params = useLocalSearchParams<{ seed?: string }>();
// //   const [msgs, setMsgs] = useState<Msg[]>([]);
// //   const [text, setText] = useState("");
// //   const [busy, setBusy] = useState(false);
// //   const sessionId = useMemo(() => `chat_${user?.user_id ?? "guest"}_${Date.now()}`, [user]);
// //   const scrollRef = useRef<ScrollView>(null);
// //   const seededRef = useRef(false);

// //   useEffect(() => {
// //     if (params.seed && !seededRef.current && !busy) {
// //       seededRef.current = true;
// //       send(String(params.seed));
// //     }
// //     // eslint-disable-next-line react-hooks/exhaustive-deps
// //   }, [params.seed]);

// //   const send = async (override?: string) => {
// //     const content = (override ?? text).trim();
// //     if (!content || busy) return;
// //     setMsgs((m) => [...m, { role: "user", content }]);
// //     setText("");
// //     setBusy(true);
// //     try {
// //       const r = await api<{ reply: string }>("/ai/chat", {
// //         method: "POST",
// //         body: { session_id: sessionId, message: content },
// //       });
// //       setMsgs((m) => [...m, { role: "assistant", content: r.reply }]);
// //     } catch (e: any) {
// //       setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${e.message || "AI unavailable"}` }]);
// //     } finally {
// //       setBusy(false);
// //       setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
// //     }
// //   };

// //   return (
// //     <SafeAreaView edges={["top"]} style={styles.root} testID="ai-screen">
// //       <View style={styles.header}>
// //         <View>
// //           <Text style={styles.title}>GC AI Assistant</Text>
// //           <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
// //             <View style={styles.dot} />
// //             <Text style={styles.online}>Online · Claude Haiku 4.5</Text>
// //           </View>
// //         </View>
// //         <View style={styles.aiAvatar}><Ionicons name="sparkles" size={18} color="#fff" /></View>
// //       </View>

// //       <KeyboardAvoidingView
// //         style={{ flex: 1 }}
// //         behavior="translate-with-padding"
// //         keyboardVerticalOffset={0}
// //       >
// //         <ScrollView
// //           ref={scrollRef}
// //           style={{ flex: 1 }}
// //           contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
// //           testID="chat-scroll"
// //         >
// //           {msgs.length === 0 && (
// //             <View style={styles.empty}>
// //               <Ionicons name="sparkles" size={28} color={theme.brandPrimary} />
// //               <Text style={styles.emptyT}>Ask me anything academic</Text>
// //               <Text style={styles.emptyS}>Math steps · concept explanations · study plans</Text>
// //               <View style={styles.starters}>
// //                 {STARTERS.map((s) => (
// //                   <Pressable
// //                     key={s}
// //                     testID={`starter-${s.slice(0, 12)}`}
// //                     style={styles.starter}
// //                     onPress={() => send(s)}
// //                   >
// //                     <Text style={styles.starterTxt}>{s}</Text>
// //                   </Pressable>
// //                 ))}
// //               </View>
// //             </View>
// //           )}
// //           {msgs.map((m, i) => (
// //             <View
// //               key={i}
// //               testID={`msg-${i}`}
// //               style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}
// //             >
// //               <Text style={m.role === "user" ? styles.userTxt : styles.aiTxt}>
// //                 {m.role === "user" ? m.content : humanize(m.content)}
// //               </Text>
// //             </View>
// //           ))}
// //           {busy && (
// //             <View style={[styles.bubble, styles.aiBubble]} testID="typing">
// //               <ActivityIndicator color={theme.brandPrimary} />
// //             </View>
// //           )}
// //         </ScrollView>

// //         <View style={styles.inputWrap}>
// //           <TextInput
// //             testID="chat-input"
// //             value={text}
// //             onChangeText={setText}
// //             placeholder="Ask GC AI..."
// //             placeholderTextColor={theme.onSurfaceMuted}
// //             style={styles.input}
// //             multiline
// //           />
// //           <Pressable style={styles.sendBtn} onPress={() => send()} testID="send-btn" disabled={busy}>
// //             <Ionicons name="send" size={18} color="#fff" />
// //           </Pressable>
// //         </View>
// //       </KeyboardAvoidingView>
// //     </SafeAreaView>
// //   );
// // }

// // const styles = StyleSheet.create({
// //   root: { flex: 1, backgroundColor: theme.surface },
// //   header: {
// //     flexDirection: "row", justifyContent: "space-between", alignItems: "center",
// //     padding: spacing.lg, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: theme.divider,
// //   },
// //   title: { fontSize: 18, fontWeight: "800", color: theme.brand },
// //   dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.success },
// //   online: { fontSize: 12, color: theme.onSurfaceMuted },
// //   aiAvatar: {
// //     width: 40, height: 40, borderRadius: 20, backgroundColor: theme.brandPrimary,
// //     alignItems: "center", justifyContent: "center",
// //   },
// //   empty: { alignItems: "center", padding: spacing.xl, gap: 6 },
// //   emptyT: { fontWeight: "800", fontSize: 18, color: theme.onSurface, marginTop: 6 },
// //   emptyS: { color: theme.onSurfaceMuted, marginBottom: spacing.md },
// //   starters: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
// //   starter: {
// //     backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border,
// //     paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
// //   },
// //   starterTxt: { color: theme.onSurface, fontSize: 12 },
// //   bubble: { maxWidth: "85%", padding: spacing.md, borderRadius: radii.md },
// //   userBubble: { alignSelf: "flex-end", backgroundColor: theme.brand },
// //   aiBubble: { alignSelf: "flex-start", backgroundColor: "#fff", ...shadow1 },
// //   userTxt: { color: "#fff", fontSize: 15, lineHeight: 21 },
// //   aiTxt: { color: theme.onSurface, fontSize: 15, lineHeight: 21 },
// //   inputWrap: {
// //     flexDirection: "row", padding: spacing.md, gap: spacing.sm, alignItems: "flex-end",
// //     backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: theme.divider,
// //   },
// //   input: {
// //     flex: 1, backgroundColor: theme.surface, borderRadius: radii.md, paddingHorizontal: 14,
// //     paddingVertical: 10, fontSize: 15, color: theme.onSurface, maxHeight: 120,
// //   },
// //   sendBtn: {
// //     width: 44, height: 44, borderRadius: 22, backgroundColor: theme.brandPrimary,
// //     alignItems: "center", justifyContent: "center",
// //   },
// // });





































// import { useEffect, useRef, useState, useMemo } from "react";
// import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView, Platform, Animated } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { KeyboardAvoidingView } from "react-native-keyboard-controller";
// import { Ionicons } from "@expo/vector-icons";
// import { useLocalSearchParams } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { api, API_BASE, readToken } from "@/src/api";
// import { useAuth } from "@/src/auth";
// import { humanize } from "@/src/format";

// type Msg = { role: "user" | "assistant"; content: string };
// const STARTERS = [
//   "Explain differentiation from first principles",
//   "Give me a similar problem to solve",
//   "Summarise Newton's laws in 3 bullets",
//   "Create a 30-min study plan for me",
// ];

// // Typing indicator component with animated dots
// function TypingIndicator() {
//   const [dotCount, setDotCount] = useState(1);

//   useEffect(() => {
//     const interval = setInterval(() => {
//       setDotCount((prev) => (prev % 3) + 1);
//     }, 400);
//     return () => clearInterval(interval);
//   }, []);

//   const dots = ".".repeat(dotCount) + " ".repeat(3 - dotCount);

//   return (
//     <View style={[styles.bubble, styles.aiBubble, styles.typingContainer]}>
//       <Text style={styles.aiTxt}>AI is typing{dots}</Text>
//     </View>
//   );
// }

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
//   }, [params.seed]);

//   const send = async (override?: string) => {
//     const content = (override ?? text).trim();
//     if (!content || busy) return;

//     setMsgs((m) => [...m, { role: "user", content }]);
//     setText("");
//     setBusy(true);

//     try {
//       console.log(`[AI] Sending message on ${Platform.OS}:`, content);

//       const token = await readToken();
//       console.log(`[AI] Token exists:`, !!token);

//       // Use the main /ai/chat endpoint which has the full AI capabilities
//       const response = await fetch(`${API_BASE}/ai/chat`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           ...(token ? { "Authorization": `Bearer ${token}` } : {}),
//         },
//         body: JSON.stringify({
//           session_id: sessionId,
//           message: content,
//           subject: "General Mathematics",
//           current_problem: content,
//         }),
//       });

//       console.log(`[AI] Response status:`, response.status);

//       if (!response.ok) {
//         const errorText = await response.text();
//         console.log(`[AI] Error response:`, errorText);
//         if (response.status === 401) {
//           throw new Error("Authentication required. Please log in again.");
//         }
//         throw new Error(`Server error: ${response.status} - ${errorText}`);
//       }

//       // For streaming response, we need to read the stream
//       const reader = response.body?.getReader();
//       const decoder = new TextDecoder();
//       let fullReply = "";

//       if (reader) {
//         while (true) {
//           const { done, value } = await reader.read();
//           if (done) break;

//           const chunk = decoder.decode(value);
//           const lines = chunk.split("\n");

//           for (const line of lines) {
//             if (line.startsWith("data: ")) {
//               try {
//                 const data = JSON.parse(line.slice(6));
//                 if (data.delta) {
//                   fullReply += data.delta;
//                   // Update the message in real-time
//                   setMsgs((m) => {
//                     const last = m[m.length - 1];
//                     if (last && last.role === "assistant") {
//                       const updated = [...m];
//                       updated[updated.length - 1] = { ...last, content: fullReply };
//                       return updated;
//                     } else {
//                       return [...m, { role: "assistant", content: fullReply }];
//                     }
//                   });
//                 }
//                 if (data.done) {
//                   console.log("Stream complete");
//                 }
//               } catch (e) {
//                 // Skip non-JSON lines
//               }
//             }
//           }
//         }
//       }

//       // If no streaming data was received, try the non-streaming endpoint
//       if (!fullReply) {
//         console.log("[AI] No streaming data, trying /ai/explain");
//         const fallbackResponse = await fetch(`${API_BASE}/ai/explain`, {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             ...(token ? { "Authorization": `Bearer ${token}` } : {}),
//           },
//           body: JSON.stringify({
//             session_id: sessionId,
//             message: content,
//             subject: "General Mathematics",
//             current_problem: content,
//           }),
//         });

//         if (fallbackResponse.ok) {
//           const fallbackData = await fallbackResponse.json();
//           let reply = fallbackData.reply || fallbackData.answer || "I couldn't generate a response. Please try again.";
//           if (typeof reply === 'object') {
//             reply = JSON.stringify(reply);
//           }
//           // Check if we got a real answer or a safety response
//           if (reply.includes("User Safety: safe")) {
//             throw new Error("The AI service returned a safety check response. Please try rephrasing your question.");
//           }
//           setMsgs((m) => [...m, { role: "assistant", content: reply }]);
//         } else {
//           throw new Error("Failed to get response from AI service");
//         }
//       }

//     } catch (e: any) {
//       console.error("[AI] Chat error:", e);
//       let errorMsg = "AI unavailable. Please try again.";

//       if (e.message?.includes("401") || e.message?.includes("Authentication") || e.message?.includes("Missing token")) {
//         errorMsg = "Your session has expired. Please log in again.";
//       } else if (e.message?.includes("safety")) {
//         errorMsg = "I couldn't process that request. Please try rephrasing your question.";
//       } else if (e.message) {
//         errorMsg = e.message;
//       }

//       setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${errorMsg}` }]);
//     } finally {
//       setBusy(false);
//       setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
//     }
//   };

//   const renderMessage = (content: string, role: "user" | "assistant") => {
//     if (role === "assistant" && typeof content === 'string') {
//       try {
//         // Check if it's a safety response
//         if (content.includes("User Safety: safe")) {
//           return "I couldn't process that request. Please try rephrasing your question.";
//         }
//         return humanize ? humanize(content) : content;
//       } catch (e) {
//         return content;
//       }
//     }
//     return content;
//   };

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="ai-screen">
//       <View style={styles.header}>
//         <View>
//           <Text style={styles.title}>GC AI Assistant</Text>
//           <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
//             <View style={styles.dot} />
//             <Text style={styles.online}>Online · AI Tutor</Text>
//           </View>
//         </View>
//         <View style={styles.aiAvatar}>
//           <Ionicons name="sparkles" size={18} color="#fff" />
//         </View>
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
//                 {m.role === "user" ? m.content : renderMessage(m.content, m.role)}
//               </Text>
//             </View>
//           ))}
//           {busy && <TypingIndicator />}
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
//   typingContainer: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 4,
//   },
//   dotsContainer: {
//     flexDirection: "row",
//     alignItems: "center",
//   },
//   dot: {
//     fontSize: 24,
//     fontWeight: "bold",
//     color: theme.brandPrimary,
//     marginLeft: -2,
//   },
// });
























































import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  Animated,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api, API_BASE, readToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { humanize } from "@/src/format";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.75, 300);

type Msg = { role: "user" | "assistant"; content: string };
type Session = {
  session_id: string;
  title: string;
  subject?: string;
  updated_at: string;
  pinned?: boolean;
  messages?: Msg[];
};

const STARTERS = [
  "Explain differentiation from first principles",
  "Give me a similar problem to solve",
  "Summarise Newton's laws in 3 bullets",
  "Create a 30-min study plan for me",
];

// ----- Typing Indicator -----
function TypingIndicator({ status }: { status: string }) {
  const [dotCount, setDotCount] = useState(1);
  useEffect(() => {
    const interval = setInterval(() => setDotCount((p) => (p % 3) + 1), 400);
    return () => clearInterval(interval);
  }, []);
  const dots = ".".repeat(dotCount) + " ".repeat(3 - dotCount);
  return (
    <View style={[styles.bubble, styles.aiBubble, styles.typingContainer]}>
      <Text style={styles.aiTxt}>{status}{dots}</Text>
    </View>
  );
}

// ----- Format date helper -----
function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
}

function sortAndDeduplicateSessions(input: Session[]): Session[] {
  const byId = new Map<string, Session>();
  input.forEach((session) => {
    const existing = byId.get(session.session_id);
    if (!existing || new Date(session.updated_at).getTime() >= new Date(existing.updated_at).getTime()) {
      byId.set(session.session_id, session);
    }
  });
  return Array.from(byId.values()).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export default function AITutor() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ seed?: string }>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState("Preparing your question");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isNewChat, setIsNewChat] = useState(true);
  const [titleGenerated, setTitleGenerated] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const seededRef = useRef(false);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  // ----- Load sessions -----
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const token = await readToken();
      const res = await fetch(`${API_BASE}/ai/sessions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(sortAndDeduplicateSessions(data as Session[]));
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ----- Create a new chat -----
  const createNewChat = () => {
    setMsgs([]);
    setCurrentSessionId(null);
    setIsNewChat(true);
    setTitleGenerated(false);
    setText("");
    closeDrawer();
  };

  // ----- Load a specific chat -----
  const loadChat = async (sessionId: string) => {
    try {
      const token = await readToken();
      const res = await fetch(`${API_BASE}/ai/sessions/${sessionId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setMsgs(data.messages || []);
        setCurrentSessionId(sessionId);
        setIsNewChat(false);
        setTitleGenerated(true);
        closeDrawer();
      }
    } catch (error) {
      console.error("Failed to load chat:", error);
    }
  };

  // ----- Delete a chat -----
  const deleteChat = async (sessionId: string) => {
    try {
      const token = await readToken();
      await fetch(`${API_BASE}/ai/sessions/${sessionId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      if (currentSessionId === sessionId) {
        createNewChat();
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  // ----- Toggle pin -----
  const togglePin = async (sessionId: string) => {
    try {
      const session = sessions.find((s) => s.session_id === sessionId);
      const newPinned = !session?.pinned;
      const token = await readToken();
      const response = await fetch(`${API_BASE}/ai/sessions/${sessionId}/pin`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ pinned: newPinned }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update pin: ${response.status}`);
      }
      setSessions((prev) => {
        const updated = prev.map((s) =>
          s.session_id === sessionId ? { ...s, pinned: newPinned } : s
        );
        return sortAndDeduplicateSessions(updated);
      });
    } catch (error) {
      console.error("Failed to toggle pin:", error);
    }
  };

  // ----- Auto‑generate title (first 5 words of first user message) -----
  const generateTitle = async (sessionId: string, message: string) => {
    const words = message.split(" ");
    let title = words.slice(0, 5).join(" ");
    if (title.length > 40) title = title.slice(0, 40) + "...";
    if (title.length < 3) title = "New Chat";
    try {
      const token = await readToken();
      await fetch(`${API_BASE}/ai/sessions/${sessionId}/title`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title }),
      });
      // Update sessions list
      setSessions((prev) => {
        const exists = prev.some((s) => s.session_id === sessionId);
        if (exists) {
          return sortAndDeduplicateSessions(prev.map((s) =>
            s.session_id === sessionId
              ? { ...s, title, updated_at: new Date().toISOString() }
              : s
          ));
        }
        return sortAndDeduplicateSessions([
          { session_id: sessionId, title, updated_at: new Date().toISOString() },
          ...prev,
        ]);
      });
      setTitleGenerated(true);
    } catch (error) {
      console.error("Failed to generate title:", error);
    }
  };

  // ----- Send message (streaming) -----
  const send = async (override?: string) => {
    const content = (override ?? text).trim();
    if (!content || busy) return;

    // If it's a new chat, generate a temporary session id (backend will create it)
    const sessionId = currentSessionId || `chat_${Date.now()}`;
    if (isNewChat) {
      setCurrentSessionId(sessionId);
      setIsNewChat(false);
    }

    setMsgs((m) => [...m, { role: "user", content }]);
    setText("");
    setBusy(true);
    setAiStatus("Preparing your question");

    // Add placeholder for assistant message
    setMsgs((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const token = await readToken();
      setAiStatus("Connecting to your AI tutor");
      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: content,
          subject: "General Mathematics",
          current_problem: content,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";
      let receivedSessionId: string | null = null;
      let receivedContent = false;

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const line = part.replace(/^data: /, "").trim();
            if (!line) continue;
            try {
              const data = JSON.parse(line);
              if (data.delta) {
                receivedContent = true;
                setAiStatus("Writing your answer");
                fullReply += data.delta;
                // Update assistant message in real-time
                setMsgs((m) => {
                  const last = m[m.length - 1];
                  if (last && last.role === "assistant") {
                    const updated = [...m];
                    updated[updated.length - 1] = { ...last, content: fullReply };
                    return updated;
                  }
                  return m;
                });
              }
              if (data.done && data.session_id) {
                receivedSessionId = data.session_id;
                // If we get a new session id, update current
                if (receivedSessionId && !currentSessionId) {
                  setCurrentSessionId(receivedSessionId);
                }
              }
            } catch { }
          }
        }
      }

      // If no streaming data, fallback to /ai/explain
      if (!fullReply) {
        setAiStatus("Trying another explanation service");
        const fallbackRes = await fetch(`${API_BASE}/ai/explain`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            session_id: sessionId,
            message: content,
            subject: "General Mathematics",
            current_problem: content,
          }),
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          let reply = data.reply || data.answer || "I couldn't generate a response.";
          if (typeof reply === "object") reply = JSON.stringify(reply);
          if (reply.includes("User Safety: safe")) {
            throw new Error("Please rephrase your question.");
          }
          setMsgs((m) => {
            const last = m[m.length - 1];
            if (last && last.role === "assistant") {
              const updated = [...m];
              updated[updated.length - 1] = { ...last, content: reply };
              return updated;
            }
            return [...m, { role: "assistant", content: reply }];
          });
          fullReply = reply;
          setAiStatus("Finishing your answer");
        } else {
          throw new Error("Failed to get response from AI service");
        }
      }

      if (receivedContent) setAiStatus("Finishing your answer");

      // Auto-generate title if this is a new chat and we have a session id
      const effectiveSessionId = receivedSessionId || currentSessionId || sessionId;
      if (isNewChat && !titleGenerated && effectiveSessionId) {
        await generateTitle(effectiveSessionId, content);
        setTitleGenerated(true);
      } else if (isNewChat) {
        // In case title generation didn't happen, we still need to add session to list
        // For now, we'll rely on the generateTitle call above.
      }

      // Ensure session is in list (if not already)
      if (effectiveSessionId && !sessions.some((s) => s.session_id === effectiveSessionId)) {
        const title = content.slice(0, 30) || "New Chat";
        setSessions((prev) => sortAndDeduplicateSessions([
          { session_id: effectiveSessionId, title, updated_at: new Date().toISOString() },
          ...prev,
        ]));
      }
    } catch (e: any) {
      console.error("Chat error:", e);
      let errorMsg = "AI unavailable. Please try again.";
      if (e.message?.includes("401") || e.message?.includes("Authentication")) {
        errorMsg = "Your session has expired. Please log in again.";
      } else if (e.message) {
        errorMsg = e.message;
      }
      setMsgs((m) => {
        const last = m[m.length - 1];
        if (last && last.role === "assistant") {
          const updated = [...m];
          updated[updated.length - 1] = { ...last, content: `⚠️ ${errorMsg}` };
          return updated;
        }
        return [...m, { role: "assistant", content: `⚠️ ${errorMsg}` }];
      });
    } finally {
      setBusy(false);
      setAiStatus("Preparing your question");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // ----- Drawer animations -----
  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.spring(drawerAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  const closeDrawer = () => {
    Animated.spring(drawerAnim, {
      toValue: -DRAWER_WIDTH,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start(() => setDrawerOpen(false));
  };

  // ----- Handle seed from navigation -----
  useEffect(() => {
    if (params.seed && !seededRef.current && !busy) {
      seededRef.current = true;
      send(String(params.seed));
    }
  }, [params.seed]);

  // ----- Auto-scroll on new messages -----
  useEffect(() => {
    if (msgs.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [msgs]);

  // ----- Render message with humanize -----
  const renderMessage = (content: string, role: "user" | "assistant") => {
    if (role === "assistant" && typeof content === "string") {
      if (content.includes("User Safety: safe")) {
        return "I couldn't process that request. Please try rephrasing your question.";
      }
      return humanize ? humanize(content) : content;
    }
    return content;
  };

  // ----- Render -----
  const currentTitle = sessions.find((s) => s.session_id === currentSessionId)?.title || "New Chat";

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="ai-screen">
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={openDrawer} style={styles.menuBtn}>
          <Ionicons name="menu" size={24} color={theme.brand} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentTitle}
        </Text>
        <Pressable onPress={createNewChat} style={styles.newChatBtn}>
          <Ionicons name="add-circle" size={28} color={theme.brandPrimary} />
        </Pressable>
      </View>

      {/* Main chat area */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="translate-with-padding" keyboardVerticalOffset={0}>
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
          {busy && <TypingIndicator status={aiStatus} />}
        </ScrollView>

        {/* Input area */}
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
          <Pressable
            style={[styles.sendBtn, busy && { opacity: 0.5 }]}
            onPress={() => send()}
            testID="send-btn"
            disabled={busy}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Drawer Overlay */}
      {drawerOpen && (
        <TouchableWithoutFeedback onPress={closeDrawer}>
          <View style={[styles.overlay, { top: insets.top }]} />
        </TouchableWithoutFeedback>
      )}

      {/* Drawer */}
      <Animated.View style={[styles.drawer, { top: insets.top, transform: [{ translateX: drawerAnim }] }]}>
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Chats</Text>
          <Pressable onPress={createNewChat} style={styles.drawerNewBtn}>
            <Ionicons name="add-circle" size={24} color={theme.brandPrimary} />
            <Text style={styles.drawerNewText}>New</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.drawerList}>
          {loadingSessions ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={theme.brandPrimary} />
          ) : sessions.length === 0 ? (
            <View style={styles.drawerEmpty}>
              <Ionicons name="chatbubbles-outline" size={40} color={theme.onSurfaceMuted} />
              <Text style={styles.drawerEmptyText}>No chats yet</Text>
            </View>
          ) : (
            sessions.map((s) => (
              <View key={s.session_id} style={styles.drawerItem}>
                <Pressable
                  style={styles.drawerItemContent}
                  onPress={() => loadChat(s.session_id)}
                >
                  <View style={styles.drawerItemText}>
                    <Text style={styles.drawerItemTitle} numberOfLines={1}>
                      {s.title || "Untitled"}
                    </Text>
                    <Text style={styles.drawerItemMeta}>
                      {formatDate(s.updated_at)}
                      {s.subject && s.subject !== "General" && (
                        <Text style={styles.drawerItemSubject}> · {s.subject}</Text>
                      )}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.drawerItemActions}>
                  <Pressable onPress={() => togglePin(s.session_id)} style={styles.drawerActionBtn}>
                   <FontAwesome6
  name="thumbtack"
  size={15}
  color={s.pinned ? theme.brandPrimary : theme.onSurfaceMuted}
/>
                  </Pressable>
                  <Pressable onPress={() => deleteChat(s.session_id)} style={styles.drawerActionBtn}>
                    <Ionicons name="trash-outline" size={18} color={theme.error} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ----- Styles -----
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  menuBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: theme.brand,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  newChatBtn: { padding: 4 },
  empty: { alignItems: "center", padding: spacing.xl, gap: 6 },
  emptyT: { fontWeight: "800", fontSize: 18, color: theme.onSurface, marginTop: 6 },
  emptyS: { color: theme.onSurfaceMuted, marginBottom: spacing.md },
  starters: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  starter: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  starterTxt: { color: theme.onSurface, fontSize: 12 },
  bubble: { maxWidth: "85%", padding: spacing.md, borderRadius: radii.md },
  userBubble: { alignSelf: "flex-end", backgroundColor: theme.brand },
  aiBubble: { alignSelf: "flex-start", backgroundColor: "#fff", ...shadow1 },
  userTxt: { color: "#fff", fontSize: 15, lineHeight: 21 },
  aiTxt: { color: theme.onSurface, fontSize: 15, lineHeight: 21 },
  inputWrap: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: "flex-end",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: theme.divider,
  },
  input: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.onSurface,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  typingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 10,
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#fff",
    zIndex: 20,
    ...shadow1,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  drawerTitle: { fontSize: 18, fontWeight: "700", color: theme.brand },
  drawerNewBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  drawerNewText: { color: theme.brandPrimary, fontWeight: "600" },
  drawerList: { flex: 1 },
  drawerEmpty: { alignItems: "center", padding: spacing.xl, gap: 8 },
  drawerEmptyText: { color: theme.onSurfaceMuted, fontSize: 14 },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  drawerItemContent: { flex: 1 },
  drawerItemText: { flex: 1 },
  drawerItemTitle: { fontSize: 14, fontWeight: "500", color: theme.onSurface },
  drawerItemMeta: { fontSize: 12, color: theme.onSurfaceMuted, marginTop: 2 },
  drawerItemSubject: { color: theme.brandPrimary, fontWeight: "500" },
  drawerItemActions: { flexDirection: "row", gap: 8, marginLeft: 8 },
  drawerActionBtn: { padding: 4 },
});




























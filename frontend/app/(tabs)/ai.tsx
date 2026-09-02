
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
  Alert,
  Clipboard,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { FontAwesome6 } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
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
      <View style={styles.typingDotsRow}>
        <Text style={styles.typingDot}>{dots.trim() || "."}</Text>
      </View>
      <Text style={styles.typingStatus}>{status}</Text>
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
  useTheme(); // re-render this screen when light/dark changes
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
  const [feedbackMap, setFeedbackMap] = useState<Record<number, "good" | "bad">>({});
  const [replyContext, setReplyContext] = useState<string | null>(null);
  const [feedbackModalIndex, setFeedbackModalIndex] = useState<number | null>(null);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [thinkingStage, setThinkingStage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const seededRef = useRef(false);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const typingMessages = [
    "Checking your question",
    "Looking for the best explanation",
    "Providing accurate steps",
    "Finalising the answer",
  ];

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

  const refreshActiveSession = useCallback(async (sessionId: string | null) => {
    if (!sessionId) return;
    try {
      const token = await readToken();
      const res = await fetch(`${API_BASE}/ai/sessions/${sessionId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      setMsgs(Array.isArray(data.messages) ? data.messages : []);
      setCurrentSessionId(sessionId);
      setIsNewChat(false);
    } catch (error) {
      console.error("Failed to refresh session:", error);
    }
  }, []);

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

    if (currentSessionId) {
      await refreshActiveSession(currentSessionId);
    }

    const finalMessage = content;

    // If it's a new chat, generate a temporary session id (backend will create it)
    const sessionId = currentSessionId || `chat_${Date.now()}`;
    if (isNewChat) {
      setCurrentSessionId(sessionId);
      setIsNewChat(false);
    }

    setMsgs((m) => [...m, { role: "user", content: finalMessage }]);
    setText("");
    setReplyContext(null);
    setBusy(true);
    setThinkingStage(0);
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
          message: finalMessage,
          subject: "General Mathematics",
          current_problem: finalMessage,
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
            message: finalMessage,
            subject: "General Mathematics",
            current_problem: finalMessage,
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

  const handleCopyMessage = async (content: string) => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(content);
      } else {
        Clipboard.setString(content);
      }
      Alert.alert("Copied", "Message copied to your clipboard.");
    } catch (error) {
      console.error("Copy failed:", error);
      Alert.alert("Copy failed", "Unable to copy this message right now.");
    }
  };

  const handleAttachMessage = (content: string) => {
    const fullMessage = content.trim();
    if (!fullMessage) return;
    const attachment = `"${fullMessage}"`;
    setReplyContext(fullMessage);
    setText((previous) => {
      const current = previous.trim();
      return current ? `${current}\n\n${attachment}` : attachment;
    });
    requestAnimationFrame(() => inputRef.current?.focus());
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const submitFeedback = async (rating: "good" | "bad", content: string, reason?: string) => {
    if (!currentSessionId) return;
    try {
      const token = await readToken();
      await fetch(`${API_BASE}/ai/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          session_id: currentSessionId,
          rating,
          message: content,
          reason: reason || "",
        }),
      });
    } catch (error) {
      console.error("Failed to submit AI feedback:", error);
    }
  };

  const handleFeedback = async (index: number, rating: "good" | "bad", content: string) => {
    if (rating === "bad") {
      setFeedbackModalIndex(index);
      setFeedbackReason("");
      return;
    }

    setFeedbackMap((prev) => ({ ...prev, [index]: rating }));
    await submitFeedback(rating, content);
  };

  const confirmBadFeedback = async (index: number, content: string) => {
    const reason = feedbackReason.trim();
    setFeedbackMap((prev) => ({ ...prev, [index]: "bad" }));
    setFeedbackModalIndex(null);
    setFeedbackReason("");
    await submitFeedback("bad", content, reason || "No reason provided");
  };

  useEffect(() => {
    if (!busy) return;
    const interval = setInterval(() => {
      setThinkingStage((prev) => (prev + 1) % typingMessages.length);
    }, 1400);
    return () => clearInterval(interval);
  }, [busy, typingMessages.length]);

  const typingStatus = busy ? typingMessages[thinkingStage] : "Preparing your question";

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
        {replyContext && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewRow}>
              <Ionicons name="attach" size={14} color={theme.brandPrimary} />
              <Text style={styles.replyPreviewLabel}>Attached message</Text>
              <Pressable onPress={() => setReplyContext(null)}>
                <Ionicons name="close-circle" size={16} color={theme.onSurfaceMuted} />
              </Pressable>
            </View>
            <Text style={styles.replyPreviewText} numberOfLines={2}>{replyContext}</Text>
          </View>
        )}
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
          {msgs.map((m, i) => {
            if (m.role === "assistant") {
              const isGood = feedbackMap[i] === "good";
              const isBad = feedbackMap[i] === "bad";
              return (
                <Swipeable
                  key={`msg-${i}`}
                  renderRightActions={() => (
                    <View style={styles.swipeActions}>
                      <Pressable
                        onPress={() => handleCopyMessage(m.content)}
                        style={[styles.swipeAction, styles.copyAction]}
                      >
                        <Ionicons name="copy-outline" size={16} color="#fff" />
                        <Text style={styles.swipeActionText}>Copy</Text>
                      </Pressable>
                    </View>
                  )}
                  onSwipeableOpen={() => handleAttachMessage(m.content)}
                >
                  <View testID={`msg-${i}`} style={[styles.bubble, styles.aiBubble]}>
                    <Text style={styles.aiTxt}>{renderMessage(m.content, m.role)}</Text>
                    <View style={styles.messageActionsRow}>
                      <Pressable onPress={() => handleCopyMessage(m.content)} style={styles.copyInlineBtn}>
                        <Ionicons name="copy-outline" size={14} color={theme.onSurfaceMuted} />
                        <Text style={styles.copyInlineText}>Copy</Text>
                      </Pressable>
                      <View style={styles.feedbackRow}>
                        <Pressable
                          onPress={() => handleFeedback(i, "good", m.content)}
                          style={[styles.feedbackBtn, isGood && styles.feedbackActiveGood]}
                        >
                          <Ionicons name="thumbs-up-outline" size={14} color={isGood ? "#fff" : theme.brandPrimary} />
                        </Pressable>
                        <Pressable
                          onPress={() => handleFeedback(i, "bad", m.content)}
                          style={[styles.feedbackBtn, isBad && styles.feedbackActiveBad]}
                        >
                          <Ionicons name="thumbs-down-outline" size={14} color={isBad ? "#fff" : theme.error} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Swipeable>
              );
            }

            return (
              <View
                key={`msg-${i}`}
                testID={`msg-${i}`}
                style={[styles.bubble, styles.userBubble]}
              >
                <Text style={styles.userTxt}>{m.content}</Text>
                <View style={styles.messageActionsRowRight}>
                  <Pressable onPress={() => handleCopyMessage(m.content)} style={styles.copyInlineBtnAlt}>
                    <Ionicons name="copy-outline" size={14} color={theme.onBrandPrimary} />
                    <Text style={styles.copyInlineTextAlt}>Copy</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          {busy && <TypingIndicator status={typingStatus} />}
        </ScrollView>

        {/* Input area */}
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
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

      <Modal visible={feedbackModalIndex !== null} transparent animationType="fade" onRequestClose={() => setFeedbackModalIndex(null)}>
        <TouchableWithoutFeedback onPress={() => setFeedbackModalIndex(null)}>
          <View style={styles.modalBackdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Why was that answer not helpful?</Text>
          <TextInput
            value={feedbackReason}
            onChangeText={setFeedbackReason}
            placeholder="Tell us what went wrong"
            placeholderTextColor={theme.onSurfaceMuted}
            style={styles.modalInput}
            multiline
          />
          <View style={styles.modalActions}>
            <Pressable onPress={() => setFeedbackModalIndex(null)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (feedbackModalIndex !== null) {
                  const msg = msgs[feedbackModalIndex]?.content || "";
                  confirmBadFeedback(feedbackModalIndex, msg);
                }
              }}
              style={styles.modalSubmitBtn}
            >
              <Text style={styles.modalSubmitText}>Send feedback</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: t.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: t.divider,
  },
  menuBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: t.brand,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  newChatBtn: { padding: 4 },
  empty: { alignItems: "center", padding: spacing.xl, gap: 6 },
  emptyT: { fontWeight: "800", fontSize: 18, color: t.onSurface, marginTop: 6 },
  emptyS: { color: t.onSurfaceMuted, marginBottom: spacing.md },
  starters: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  starter: {
    backgroundColor: t.surfaceSecondary,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  starterTxt: { color: t.onSurface, fontSize: 12 },
  bubble: { maxWidth: "85%", padding: spacing.md, borderRadius: radii.md },
  userBubble: { alignSelf: "flex-end", backgroundColor: t.brand },
  aiBubble: { alignSelf: "flex-start", backgroundColor: t.surfaceSecondary, ...shadow1 },
  userTxt: { color: t.onBrandPrimary, fontSize: 15, lineHeight: 21 },
  aiTxt: { color: t.onSurface, fontSize: 15, lineHeight: 21 },
  swipeActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 180,
    gap: 8,
    marginLeft: 8,
  },
  swipeAction: {
    minWidth: 80,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 6,
  },
  replyAction: { backgroundColor: t.brandPrimary },
  copyAction: { backgroundColor: t.brand },
  swipeActionText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  feedbackRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 10,
  },
  feedbackBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackActiveGood: { backgroundColor: t.success },
  feedbackActiveBad: { backgroundColor: t.error },
  replyPreview: {
    backgroundColor: t.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: t.divider,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
  },
  replyPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  replyPreviewLabel: { color: t.brandPrimary, fontSize: 12, fontWeight: "700", flex: 1 },
  replyPreviewText: { color: t.onSurfaceMuted, fontSize: 12, marginTop: 4 },
  messageActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 10,
  },
  messageActionsRowRight: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  copyInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  copyInlineBtnAlt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  copyInlineText: { color: t.onSurfaceMuted, fontSize: 11, fontWeight: "600" },
  copyInlineTextAlt: { color: t.onBrandPrimary, fontSize: 11, fontWeight: "600" },
  inputWrap: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: "flex-end",
    backgroundColor: t.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: t.divider,
  },
  input: {
    flex: 1,
    backgroundColor: t.surface,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: t.onSurface,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  typingContainer: {
    alignItems: "flex-start",
    gap: 4,
  },
  typingDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 18,
  },
  typingDot: {
    color: t.brandPrimary,
    fontSize: 20,
    lineHeight: 20,
    fontWeight: "700",
  },
  typingStatus: {
    color: t.onSurfaceMuted,
    fontSize: 12,
    marginTop: 2,
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
    backgroundColor: t.surfaceSecondary,
    zIndex: 20,
    ...shadow1,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: t.divider,
  },
  drawerTitle: { fontSize: 18, fontWeight: "700", color: t.brand },
  drawerNewBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  drawerNewText: { color: t.brandPrimary, fontWeight: "600" },
  drawerList: { flex: 1 },
  drawerEmpty: { alignItems: "center", padding: spacing.xl, gap: 8 },
  drawerEmptyText: { color: t.onSurfaceMuted, fontSize: 14 },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: t.divider,
  },
  drawerItemContent: { flex: 1 },
  drawerItemText: { flex: 1 },
  drawerItemTitle: { fontSize: 14, fontWeight: "500", color: t.onSurface },
  drawerItemMeta: { fontSize: 12, color: t.onSurfaceMuted, marginTop: 2 },
  drawerItemSubject: { color: t.brandPrimary, fontWeight: "500" },
  drawerItemActions: { flexDirection: "row", gap: 8, marginLeft: 8 },
  drawerActionBtn: { padding: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    position: "absolute",
    left: 20,
    right: 20,
    top: "35%",
    backgroundColor: t.surfaceSecondary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadow1,
  },
  modalTitle: { color: t.onSurface, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  modalInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radii.md,
    backgroundColor: t.surface,
    color: t.onSurface,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  modalCancelText: { color: t.onSurface, fontWeight: "600" },
  modalSubmitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: t.brandPrimary,
  },
  modalSubmitText: { color: "#fff", fontWeight: "700" },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});




























import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput, Image,
  ActivityIndicator, Alert, Modal, Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useAudioPlayer, useAudioRecorder, RecordingPresets } from "expo-audio";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { api, API_BASE, readToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useStudyGroupSocket, type GroupMessage } from "@/src/hooks/useStudyGroupSocket";

type Member = {
  user_id: string; full_name: string; profile_photo?: string | null;
  role: string; status?: string;
};

type Group = {
  group_id: string; name: string; description: string; exam_level: string;
  member_count: number; is_member: boolean; is_admin: boolean;
  members: Member[];
};
type Paper = {
  paper_id: string; title: string; subject: string;
  year: number; paper_number: number; level: string;
};

const CLOUD = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || "qsmemy5r";
const PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "gcsharp";

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function StudyGroupChat() {
  useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [msgs, setMsgs] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiTyping, setAiTyping] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [online, setOnline] = useState(0);
  const [sockReady, setSockReady] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [papersOpen, setPapersOpen] = useState(false);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [papersLoading, setPapersLoading] = useState(false);
  const [paperQ, setPaperQ] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candQ, setCandQ] = useState("");
  const [managing, setManaging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [hlText, setHlText] = useState("");
  const [hlOpen, setHlOpen] = useState(false);
  const [hlPaper, setHlPaper] = useState<Paper | null>(null);
  const [hlSending, setHlSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const typingTimer = useRef<any>(null);
  const player = useAudioPlayer(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const seenRef = useRef<Set<string>>(new Set());
  const groupId = id as string;
  const pushMsg = useCallback((m: GroupMessage) => {
    if (seenRef.current.has(m.message_id)) return;
    seenRef.current.add(m.message_id);
    setMsgs((prev) => [...prev, m].sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at))));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const g = await api<{ group: Group }>(`/study-groups/${groupId}`);
      setGroup(g.group);
      const h = await api<{ items: GroupMessage[] }>(
        `/study-groups/${groupId}/messages?limit=60`);
      seenRef.current = new Set();
      const items = (h.items || []).sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)));
      items.forEach((m) => seenRef.current.add(m.message_id));
      setMsgs(items);
    } catch (e: any) {
      Alert.alert("Could not open group", e.message || "Try again.");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  const onEvent = useCallback((e: any) => {
    if (e.type === "ready") {
      setSockReady(true);
      setOnline(e.online_count || 0);
      if (Array.isArray(e.online_ids)) setOnlineIds(e.online_ids);
      if (e.group) setGroup(e.group);
    } else if (e.type === "message" && e.message) {
      pushMsg(e.message as GroupMessage);
      if ((e.message as GroupMessage).kind === "ai_answer") setAiTyping(false);
    } else if (e.type === "ai_typing") {
      setAiTyping(!!e.typing);
    } else if (e.type === "typing") {
      const nm = String(e.full_name || "Someone");
      setTypingNames((prev) => e.typing
        ? (prev.includes(nm) ? prev : [...prev, nm])
        : prev.filter((x) => x !== nm));
    } else if (e.type === "presence") {
      setOnline(e.online_count || 0);
      if (Array.isArray(e.online_ids)) setOnlineIds(e.online_ids);
    } else if (e.type === "member_joined" || e.type === "member_left") {
      loadAll();
    } else if (e.type === "join_request" && e.request) {
      setRequests((prev) => [e.request, ...prev]);
    } else if (e.type === "group_deleted") {
      Alert.alert("Group deleted", "This study group no longer exists.");
      router.back();
    }
  }, [loadAll, pushMsg, router]);

  const { connected, send, sockError, reconnect } = useStudyGroupSocket(groupId, onEvent);

  const onChangeText = (v: string) => {
    setText(v);
    send({ type: "typing", typing: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => send({ type: "typing", typing: false }), 1500);
  };

  // ---- @ mention popup: tag GC AI or a group member ----
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQ, setMentionQ] = useState("");
  const [cursorPos, setCursorPos] = useState(0);

  const mentionOptions = useMemo(() => {
    const q = mentionQ.toLowerCase();
    const ai = { kind: "ai" as const, user_id: "gc_ai", full_name: "GC AI",
                 profile_photo: null as string | null };
    const members = (group?.members || []).map((m) => ({
      kind: "member" as const, user_id: m.user_id, full_name: m.full_name,
      profile_photo: m.profile_photo || null,
    }));
    return [ai, ...members].filter((o) =>
      !q || o.full_name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQ, group?.members]);

  const onMentionChange = (v: string) => {
    onChangeText(v);
    const upto = v.slice(0, cursorPos || v.length);
    const m = upto.match(/@([A-Za-z0-9_ ]{0,30})$/);
    if (m) {
      setMentionQ(m[1]);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const applyMention = (o: { kind: string; full_name: string }) => {
    const before = text.slice(0, cursorPos || text.length);
    const after = text.slice(cursorPos || text.length);
    const stripped = before.replace(/@[A-Za-z0-9_ ]{0,30}$/, "");
    const label = o.kind === "ai" ? "@ai " : `@${o.full_name} `;
    const next = stripped + label + after;
    setText(next);
    setCursorPos((stripped + label).length);
    setMentionOpen(false);
    setMentionQ("");
  };

  const sendText = useCallback(async () => {
    const v = text.trim();
    if (!v) return;
    setText("");
    send({ type: "typing", typing: false });
    if (connected && sockReady) {
      send({ type: "send", kind: "text", text: v });
      return;
    }
    try {
      const r = await api<{ message: GroupMessage }>(
        `/study-groups/${groupId}/messages`,
        { method: "POST", body: { kind: "text", text: v } });
      pushMsg(r.message);
    } catch (e: any) {
      Alert.alert("Not sent", e.message || "Check your connection.");
      setText(v);
    }
  }, [text, connected, sockReady, send, groupId, pushMsg]);

  const askAi = useCallback(async () => {
    const v = text.trim();
    if (!v) return;
    const question = v.toLowerCase().startsWith("@ai") ? v : `@ai ${v}`;
    setText("");
    if (connected && sockReady) {
      send({ type: "ask_ai", question });
      return;
    }
    try {
      const r = await api<{ question: GroupMessage; answer: GroupMessage }>(
        `/study-groups/${groupId}/ask-ai`,
        { method: "POST", body: { question } });
      pushMsg(r.question);
      if (r.answer?.message_id) pushMsg(r.answer);
    } catch (e: any) {
      Alert.alert("GC AI failed", e.message || "Try again.");
    }
  }, [text, connected, sockReady, send, groupId, pushMsg]);
  const loadPapers = useCallback(async (qq: string) => {
    setPapersLoading(true);
    try {
      const level = group?.exam_level || user?.exam_level || "";
      const qs = [`level=${encodeURIComponent(level)}`, "limit=30"];
      if (qq.trim()) qs.push(`q=${encodeURIComponent(qq.trim())}`);
      const r = await api<{ items: Paper[] }>(`/papers?${qs.join("&")}`);
      setPapers(r.items || []);
    } catch { setPapers([]); }
    finally { setPapersLoading(false); }
  }, [group?.exam_level, user?.exam_level]);

  const sharePaper = async (p: Paper) => {
    setPapersOpen(false);
    const payload = { kind: "paper", text: "", paper_id: p.paper_id };
    if (connected && sockReady) { send({ type: "send", ...payload }); return; }
    try {
      const r = await api<{ message: GroupMessage }>(
        `/study-groups/${groupId}/messages`, { method: "POST", body: payload });
      pushMsg(r.message);
    } catch (e: any) { Alert.alert("Not sent", e.message || "Try again."); }
  };

  const shareHighlight = async () => {
    const v = (hlText || text).trim();
    if (!v) { Alert.alert("Highlight a question", "Paste or type the question, then tap Send to group."); return; }
    setHlSending(true);
    try {
      const payload: Record<string, any> = { kind: "highlight", text: v };
      if (hlPaper) payload.paper_id = hlPaper.paper_id;
      let sent = false;
      if (connected && sockReady) sent = send({ type: "send", ...payload });
      if (!sent) {
        const r = await api<{ message: GroupMessage }>(
          `/study-groups/${groupId}/messages`, { method: "POST", body: payload });
        pushMsg(r.message);
      }
      setHlText("");
      setHlPaper(null);
      setHlOpen(false);
      if (hlText) setText("");
    } catch (e: any) { Alert.alert("Not sent", e.message || "Try again."); }
    finally { setHlSending(false); }
  };

  const openHighlightComposer = (paper?: Paper | null) => {
    setHlPaper(paper || null);
    setHlText(text.trim());
    setHlOpen(true);
  };

  const uploadVoice = async (uri: string, durSec: number) => {
    const token = await readToken();
    const name = `voice_${Date.now()}.m4a`;
    const form = new FormData();
    form.append("file", { uri, name, type: "video/mp4" } as any);
    form.append("upload_preset", PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`, {
      method: "POST", body: form,
    });
    const data = await res.json();
    if (!res.ok || !data.secure_url) throw new Error(data.error?.message || "Voice upload failed");
    return { url: String(data.secure_url), dur: durSec };
  };

  const toggleRecord = async () => {
    if (recording) {
      try {
        await recorder.stop();
        const uri = recorder.uri;
        setRecording(false);
        if (!uri) return;
        setSendingVoice(true);
        try {
          const { url } = await uploadVoice(uri, 0);
          const payload = { kind: "voice", text: "", audio_url: url, duration_sec: 0 };
          if (connected && sockReady) { send({ type: "send", ...payload }); }
          else {
            const r = await api<{ message: GroupMessage }>(
              `/study-groups/${groupId}/messages`, { method: "POST", body: payload });
            pushMsg(r.message);
          }
        } catch (e: any) {
          Alert.alert("Voice note failed", e.message || "Try again.");
        } finally { setSendingVoice(false); }
      } catch { setRecording(false); }
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (e: any) {
      Alert.alert("Mic unavailable", e.message || "Check microphone permission.");
    }
  };

  const playVoice = async (m: GroupMessage) => {
    const url = m.meta?.audio_url;
    if (!url) return;
    try {
      if (playingId === m.message_id) {
        player.pause();
        setPlayingId(null);
        return;
      }
      await (player as any).replace?.(url);
      (player as any).play?.();
      setPlayingId(m.message_id);
    } catch { Alert.alert("Playback failed", "Could not play this voice note."); }
  };

  const openMembers = async () => {
    setMembersOpen(true);
    setManaging(true);
    try {
      const g = await api<{ group: Group }>(`/study-groups/${groupId}`);
      setGroup(g.group);
      if (g.group.is_admin) {
        const rq = await api<{ items: any[] }>(`/study-groups/${groupId}/requests`);
        setRequests((rq.items || []).filter((x) => x.status === "pending"));
        const cd = await api<{ items: any[] }>(`/study-groups/${groupId}/candidates`);
        setCandidates(cd.items || []);
      }
    } catch {} finally { setManaging(false); }
  };

  const decide = async (requestId: string, action: "approve" | "reject") => {
    try {
      await api(`/study-groups/${groupId}/requests/${requestId}`,
        { method: "POST", body: { action } });
      setRequests((prev) => prev.filter((x) => x.request_id !== requestId));
      if (action === "approve") loadAll();
    } catch (e: any) { Alert.alert("Failed", e.message || "Try again."); }
  };

  const invite = async (uid: string) => {
    try {
      await api(`/study-groups/${groupId}/invite`,
        { method: "POST", body: { user_id: uid } });
      setCandidates((prev) => prev.filter((x) => x.user_id !== uid));
      loadAll();
    } catch (e: any) { Alert.alert("Invite failed", e.message || "Try again."); }
  };

  const renderBubble = (m: GroupMessage) => {
    const mineMsg = m.sender_id === user?.user_id;
    const isAi = m.kind === "ai_answer";
    return (
      <View
        key={m.message_id}
        style={[styles.row, mineMsg ? styles.rowMine : styles.rowTheirs]}
      >
        {!mineMsg && (
          <View style={styles.miniAvatar}>
            {m.sender_photo ? (
              <Image source={{ uri: m.sender_photo }} style={styles.miniImg} />
            ) : (
              <Text style={styles.miniInitial}>
                {(m.sender_name || "?").charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
        )}
        <View
          style={[
            styles.bubble,
            mineMsg ? styles.bubbleMine : styles.bubbleTheirs,
            isAi && styles.bubbleAi,
          ]}
        >
          {!mineMsg && (
            <Text style={[styles.sender, isAi && styles.senderAi]}>
              {isAi ? "GC AI" : m.sender_name}
            </Text>
          )}
          {m.kind === "voice" ? (
            <Pressable style={styles.voiceRow} onPress={() => playVoice(m)}>
              <Ionicons
                name={playingId === m.message_id ? "pause" : "play"}
                size={20}
                color={mineMsg ? "#fff" : theme.brandPrimary}
              />
              <View style={styles.voiceBars}>
                {[6, 12, 18, 12, 6, 14, 18, 10].map((h, i) => (
                  <View
                    key={i}
                    style={[
                      styles.voiceBar,
                      { height: h, backgroundColor: mineMsg ? "#fff" : theme.brandPrimary },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.voiceDur, mineMsg && { color: "#fff" }]}>
                {m.meta?.duration_sec ? `${m.meta.duration_sec}s` : "voice"}
              </Text>
            </Pressable>
          ) : m.kind === "paper" ? (
            <Pressable
              style={styles.paperCard}
              onPress={() =>
                router.push(`/pdf?url=${encodeURIComponent(m.meta?.pdf_url || "")}&title=${encodeURIComponent(m.meta?.paper_title || "Paper")}` as any)
              }
            >
              <Ionicons name="document-text" size={26} color={theme.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.paperTitle} numberOfLines={2}>
                  {m.meta?.paper_title || "Past paper"}
                </Text>
                <Text style={styles.paperMeta}>
                  {[m.meta?.subject, m.meta?.year].filter(Boolean).join(" - ")}
                </Text>
                <Text style={styles.paperOpen}>Tap to open</Text>
              </View>
            </Pressable>
          ) : (
            <Text style={[styles.body, mineMsg && styles.bodyMine]}>
              {(m.kind === "highlight" || m.kind === "question") && !isAi ? `Q: ${m.text}` : m.text}
            </Text>
          )}
          {!!m.meta?.transcript && (
            <Text style={[styles.transcript, mineMsg && { color: "rgba(255,255,255,0.85)" }]}>
              {m.meta.transcript}
            </Text>
          )}
          <Text style={[styles.time, mineMsg && { color: "rgba(255,255,255,0.75)" }]}>
            {fmtTime(m.created_at)}
          </Text>
        </View>
      </View>
    );
  };
  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.brandPrimary} />
          <Text style={styles.hint}>Opening study group...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>
        <Pressable style={{ flex: 1, marginLeft: 8 }} onPress={openMembers}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {group?.name || "Study group"}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {group?.member_count || 0} members
            {online > 0 ? ` · ${online} online` : ""}
          </Text>
          {!connected && (
            <Pressable onPress={reconnect} hitSlop={8} testID="ws-retry-btn">
              <Text style={styles.retryTxt}>
                {sockError ? `${sockError} Tap to retry.` : "Reconnecting live chat… tap to retry."}
              </Text>
            </Pressable>
          )}
        </Pressable>
        <Pressable onPress={openMembers} hitSlop={8} testID="members-btn">
          <Ionicons name="people-outline" size={22} color={theme.brand} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="translate-with-padding"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chat}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {msgs.map(renderBubble)}
          {aiTyping && (
            <View style={[styles.row, styles.rowTheirs]}>
              <View style={[styles.bubble, styles.bubbleTheirs, styles.bubbleAi]}>
                <Text style={styles.senderAi}>GC AI is thinking...</Text>
                <ActivityIndicator size="small" color={theme.brandPrimary} />
              </View>
            </View>
          )}
          {typingNames.length > 0 && (
            <Text style={styles.typingHint}>
              {typingNames.join(", ")} typing...
            </Text>
          )}
        </ScrollView>

        {attachOpen && (
          <View style={styles.attachRow}>
            <Pressable
              style={styles.attachBtn}
              onPress={() => { setAttachOpen(false); setPapersOpen(true); setPaperQ(""); loadPapers(""); }}
            >
              <Ionicons name="document-text-outline" size={20} color={theme.brandPrimary} />
              <Text style={styles.attachTxt}>Past paper</Text>
            </Pressable>
            <Pressable style={styles.attachBtn} onPress={() => { setAttachOpen(false); openHighlightComposer(); }}>
              <Ionicons name="bulb-outline" size={20} color={theme.brandPrimary} />
              <Text style={styles.attachTxt}>Highlight Q</Text>
            </Pressable>
            <Pressable style={styles.attachBtn} onPress={() => { setAttachOpen(false); askAi(); }}>
              <Ionicons name="sparkles-outline" size={20} color={theme.brandPrimary} />
              <Text style={styles.attachTxt}>Ask GC AI</Text>
            </Pressable>
          </View>
        )}

        {mentionOpen && mentionOptions.length > 0 && (
          <View style={styles.mentionBox}>
            {mentionOptions.map((o) => (
              <Pressable
                key={`${o.kind}-${o.user_id}`}
                style={styles.mentionRow}
                onPress={() => applyMention(o)}
              >
                <View style={styles.miniAvatar}>
                  {o.kind === "ai" ? (
                    <Ionicons name="sparkles" size={14} color={theme.brandPrimary} />
                  ) : o.profile_photo ? (
                    <Image source={{ uri: o.profile_photo }} style={styles.miniImg} />
                  ) : (
                    <Text style={styles.miniInitial}>
                      {(o.full_name || "?").charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <Text style={styles.mentionName} numberOfLines={1}>
                  {o.kind === "ai" ? "GC AI — ask a question" : o.full_name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <Pressable onPress={() => setAttachOpen((v) => !v)} style={styles.iconBtn} testID="attach-btn">
            <Ionicons name={attachOpen ? "close" : "add"} size={22} color={theme.brandPrimary} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={onMentionChange}
            onSelectionChange={(e) => setCursorPos(e.nativeEvent.selection.start)}
            placeholder="Message... (type @ to mention)"
            placeholderTextColor={theme.onSurfaceMuted}
            style={styles.input}
            multiline
            maxLength={4000}
            testID="chat-input"
          />
          <Pressable
            onPress={toggleRecord}
            style={[styles.iconBtn, recording && styles.recActive]}
            testID="voice-btn"
          >
            <Ionicons name={recording ? "stop" : "mic"} size={20} color={recording ? "#fff" : theme.brandPrimary} />
          </Pressable>
          <Pressable onPress={sendText} style={styles.sendBtn} testID="send-btn">
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
        {(recording || sendingVoice) && (
          <Text style={styles.recHint}>
            {sendingVoice ? "Sending voice note..." : "Recording... tap mic to send"}
          </Text>
        )}
      </KeyboardAvoidingView>

      <Modal visible={papersOpen} transparent animationType="slide" onRequestClose={() => setPapersOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Share a past paper</Text>
            <Text style={styles.sheetHint}>Attach the paper, or highlight one question from it.</Text>
            <TextInput
              value={paperQ}
              onChangeText={(v) => { setPaperQ(v); loadPapers(v); }}
              placeholder="Search papers..."
              placeholderTextColor={theme.onSurfaceMuted}
              style={styles.input}
            />
            {papersLoading ? (
              <ActivityIndicator color={theme.brandPrimary} />
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {papers.map((p) => (
                  <View key={p.paper_id} style={styles.paperRowWrap}>
                    <Pressable style={styles.paperRowMain} onPress={() => sharePaper(p)}>
                      <Ionicons name="document-text-outline" size={20} color={theme.brandPrimary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paperTitle} numberOfLines={2}>{p.title}</Text>
                        <Text style={styles.paperMeta}>
                          {[p.subject, p.year].filter(Boolean).join(" - ")}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={styles.hlBtn}
                      onPress={() => { setPapersOpen(false); openHighlightComposer(p); }}
                    >
                      <Ionicons name="bulb-outline" size={15} color={theme.brandPrimary} />
                      <Text style={styles.hlBtnTxt}>Highlight</Text>
                    </Pressable>
                  </View>
                ))}
                {papers.length === 0 && (
                  <Text style={styles.hint}>No papers found for your level.</Text>
                )}
              </ScrollView>
            )}
            <Pressable style={styles.ghostBtn} onPress={() => setPapersOpen(false)}>
              <Text style={styles.ghostTxt}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={membersOpen} transparent animationType="slide" onRequestClose={() => setMembersOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>{group?.name} - Members</Text>
            {managing ? (
              <ActivityIndicator color={theme.brandPrimary} />
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {(group?.members || []).map((m) => {
                  const isOnline = onlineIds.includes(m.user_id);
                  return (
                    <View key={m.user_id} style={styles.memberRow}>
                      <View style={styles.miniAvatar}>
                        {m.profile_photo ? (
                          <Image source={{ uri: m.profile_photo }} style={styles.miniImg} />
                        ) : (
                          <Text style={styles.miniInitial}>
                            {(m.full_name || "?").charAt(0).toUpperCase()}
                          </Text>
                        )}
                        <View
                          style={[
                            styles.onlineDot,
                            isOnline ? styles.onlineDotOn : styles.onlineDotOff,
                          ]}
                        />
                      </View>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {m.full_name}{m.user_id === user?.user_id ? " (you)" : ""}
                        {isOnline ? " · online" : ""}
                      </Text>
                      {m.role === "admin" && <Text style={styles.adminTag}>admin</Text>}
                    </View>
                  );
                })}
                {group?.is_admin && requests.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Join requests</Text>
                    {requests.map((r) => (
                      <View key={r.request_id} style={styles.memberRow}>
                        <Text style={styles.memberName} numberOfLines={1}>{r.full_name}</Text>
                        <Pressable style={styles.approveBtn} onPress={() => decide(r.request_id, "approve")}>
                          <Text style={styles.approveTxt}>Approve</Text>
                        </Pressable>
                        <Pressable style={styles.rejectBtn} onPress={() => decide(r.request_id, "reject")}>
                          <Text style={styles.rejectTxt}>Decline</Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                )}
                {group?.is_admin && (
                  <>
                    <Text style={styles.sectionTitle}>Invite classmates ({group?.exam_level})</Text>
                    <TextInput
                      value={candQ}
                      onChangeText={setCandQ}
                      placeholder="Search name or email..."
                      placeholderTextColor={theme.onSurfaceMuted}
                      style={styles.input}
                    />
                    {candidates
                      .filter((c) =>
                        !candQ.trim() ||
                        (c.full_name || "").toLowerCase().includes(candQ.trim().toLowerCase()) ||
                        (c.email || "").toLowerCase().includes(candQ.trim().toLowerCase()))
                      .map((c) => (
                        <View key={c.user_id} style={styles.memberRow}>
                          <Text style={styles.memberName} numberOfLines={1}>{c.full_name}</Text>
                          <Pressable style={styles.approveBtn} onPress={() => invite(c.user_id)}>
                            <Text style={styles.approveTxt}>Invite</Text>
                          </Pressable>
                        </View>
                      ))}
                  </>
                )}
              </ScrollView>
            )}
            <Pressable style={styles.ghostBtn} onPress={() => setMembersOpen(false)}>
              <Text style={styles.ghostTxt}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={hlOpen} transparent animationType="slide" onRequestClose={() => setHlOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Highlight a question</Text>
            {!!hlPaper && (
              <Text style={styles.sheetHint} numberOfLines={2}>
                From: {hlPaper.title}
              </Text>
            )}
            <Text style={styles.sheetHint}>
              Paste the exact question (as highlighted in the paper) so mates and GC AI see it.
            </Text>
            <TextInput
              value={hlText}
              onChangeText={setHlText}
              placeholder="Paste / type the highlighted question…"
              placeholderTextColor={theme.onSurfaceMuted}
              style={[styles.input, styles.hlInput]}
              multiline
              maxLength={2000}
              testID="highlight-input"
            />
            <Pressable
              style={styles.primaryBtn}
              onPress={shareHighlight}
              disabled={hlSending || !hlText.trim()}
              testID="highlight-send-btn"
            >
              {hlSending
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryTxt}>Send to group</Text>}
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => setHlOpen(false)}>
              <Text style={styles.ghostTxt}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  hint: { color: t.onSurfaceMuted, fontSize: 13, textAlign: "center" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: t.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: t.divider,
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: t.onSurface },
  headerSub: { fontSize: 12, color: t.onSurfaceMuted },
  chat: { padding: spacing.md, gap: 8, paddingBottom: 20 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 6, maxWidth: "100%" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "80%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleMine: { backgroundColor: t.brandPrimary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: t.surfaceSecondary, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: t.border },
  bubbleAi: { borderColor: t.brandPrimary, borderWidth: 1.5 },
  sender: { fontSize: 11, fontWeight: "800", color: t.brandPrimary, marginBottom: 2 },
  senderAi: { fontSize: 11, fontWeight: "800", color: t.brandPrimary, marginBottom: 2 },
  body: { fontSize: 14.5, lineHeight: 20, color: t.onSurface },
  bodyMine: { color: "#fff" },
  transcript: { fontSize: 12, fontStyle: "italic", color: t.onSurfaceMuted, marginTop: 4 },
  time: { fontSize: 10.5, color: t.onSurfaceMuted, marginTop: 3, alignSelf: "flex-end" },
  miniAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: t.brandTertiary,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  miniImg: { width: 28, height: 28 },
  miniInitial: { fontWeight: "800", color: t.brand, fontSize: 12 },
  onlineDot: {
    position: "absolute", right: -1, bottom: -1, width: 10, height: 10,
    borderRadius: 5, borderWidth: 2, borderColor: t.surfaceSecondary,
  },
  onlineDotOn: { backgroundColor: "#22c55e" },
  onlineDotOff: { backgroundColor: t.borderStrong },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 170 },
  voiceBars: { flexDirection: "row", alignItems: "center", gap: 2, flex: 1 },
  voiceBar: { width: 3, borderRadius: 2 },
  voiceDur: { fontSize: 11, color: t.onSurfaceMuted },
  paperCard: {
    flexDirection: "row", gap: 10, backgroundColor: t.surface,
    borderRadius: radii.md, padding: 10, minWidth: 200,
  },
  paperRow: {
    flexDirection: "row", gap: 10, alignItems: "center",
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.divider,
  },
  paperRowWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.divider,
  },
  paperRowMain: { flex: 1, flexDirection: "row", gap: 10, alignItems: "center" },
  hlBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: t.brandTertiary, paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: radii.pill,
  },
  hlBtnTxt: { fontSize: 11.5, fontWeight: "800", color: t.brandPrimary },
  hlInput: { minHeight: 110, textAlignVertical: "top" },
  sheetHint: { fontSize: 12.5, color: t.onSurfaceMuted },
  primaryBtn: {
    backgroundColor: t.brandPrimary, paddingVertical: 13, borderRadius: radii.md,
    alignItems: "center",
  },
  primaryTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  retryTxt: { fontSize: 11, color: t.error, marginTop: 2 },
  paperTitle: { fontWeight: "700", fontSize: 13, color: t.onSurface },
  paperMeta: { fontSize: 11.5, color: t.onSurfaceMuted, marginTop: 2 },
  paperOpen: { fontSize: 11.5, fontWeight: "700", color: t.brandPrimary, marginTop: 4 },
  typingHint: { fontSize: 12, fontStyle: "italic", color: t.onSurfaceMuted, marginLeft: 36 },
  attachRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 8 },
  attachBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: t.surfaceSecondary, borderWidth: 1, borderColor: t.border,
    borderRadius: radii.pill, paddingVertical: 9,
  },
  attachTxt: { fontSize: 12, fontWeight: "700", color: t.onSurface },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 6,
    paddingHorizontal: spacing.sm, paddingTop: 8,
    backgroundColor: t.surfaceSecondary, borderTopWidth: 1, borderTopColor: t.divider,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  recActive: { backgroundColor: t.error, borderColor: t.error },
  input: {
    flex: 1, backgroundColor: t.surface, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9, fontSize: 14.5, color: t.onSurface,
    maxHeight: 110, borderWidth: 1, borderColor: t.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: t.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  recHint: { textAlign: "center", fontSize: 12, color: t.error, paddingVertical: 4 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: t.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, gap: spacing.sm, maxHeight: "85%",
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: t.borderStrong, opacity: 0.4 },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: t.onSurface },
  ghostBtn: { paddingVertical: 10, alignItems: "center" },
  ghostTxt: { color: t.onSurfaceMuted, fontWeight: "600" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  memberName: { flex: 1, fontSize: 14, color: t.onSurface, fontWeight: "600" },
  adminTag: {
    fontSize: 10, fontWeight: "800", color: t.brandPrimary,
    backgroundColor: t.brandTertiary, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radii.pill,
  },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: t.onSurfaceMuted, marginTop: 8 },
  mentionBox: {
    backgroundColor: t.surfaceSecondary, borderWidth: 1, borderColor: t.border,
    borderRadius: radii.md, marginHorizontal: spacing.sm, marginBottom: 6,
    maxHeight: 220, ...shadow1,
  },
  mentionRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: t.divider,
  },
  mentionName: { flex: 1, fontSize: 14, fontWeight: "600", color: t.onSurface },
  approveBtn: { backgroundColor: t.brandPrimary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
  approveTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
  rejectBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  rejectTxt: { color: t.error, fontWeight: "700", fontSize: 12 },
});

let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => { styles = createStyles(getPaletteSnapshot()); });




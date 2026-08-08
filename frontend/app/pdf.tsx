import { useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { pdfHtml } from "@/src/pdf-html";
import { api } from "@/src/api";
import { humanize } from "@/src/format";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

type Solution = { title: string; steps: { heading: string; body: string }[]; narration: string };

export default function PdfViewer() {
  const { url, title, paper_id } = useLocalSearchParams<{ url: string; title?: string; paper_id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  // Bottom-sheet-lite: which action modal is open
  const [askOpen, setAskOpen] = useState<{ text: string } | null>(null);
  const [videoOpen, setVideoOpen] = useState<{ text: string } | null>(null);
  const [saveOpen, setSaveOpen] = useState<{ text: string; page: number } | null>(null);

  const [solution, setSolution] = useState<Solution | null>(null);
  const [solLoading, setSolLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const fullUrl = useMemo(
    () => (url?.startsWith("http") ? url : `${BACKEND}${url ?? ""}`),
    [url]
  );
  const html = useMemo(() => pdfHtml(fullUrl, 1), [fullUrl]);

  const onMessage = (e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "meta") return;
      if (msg.type === "ask") setAskOpen({ text: msg.text });
      else if (msg.type === "video") setVideoOpen({ text: msg.text });
      else if (msg.type === "draft") setSaveOpen({ text: msg.text, page: msg.page ?? 1 });
    } catch {}
  };

  const askGcAi = () => {
    const t = askOpen?.text || "";
    setAskOpen(null);
    router.push({ pathname: "/(tabs)/ai", params: { seed: t } });
  };

  const generateSolution = async () => {
    if (!videoOpen) return;
    setSolution(null);
    setSolLoading(true);
    try {
      const r = await api<Solution>("/ai/solution", { method: "POST", body: { question: videoOpen.text } });
      setSolution(r);
    } catch (e: any) {
      setSolution({ title: "Error", steps: [{ heading: "Failed", body: e.message }], narration: "" });
    } finally { setSolLoading(false); }
  };

  const speak = () => {
    if (!solution) return;
    if (speaking) { Speech.stop(); setSpeaking(false); return; }
    setSpeaking(true);
    const text = humanize(solution.narration || solution.steps.map(s => `${s.heading}. ${s.body}`).join(" "));
    Speech.speak(text, {
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
      rate: 0.95,
    });
  };

  const saveDraft = async () => {
    if (!saveOpen) return;
    try {
      await api("/drafts", {
        method: "POST",
        body: {
          paper_id: paper_id || "unknown",
          title: title || "PDF paper",
          page: saveOpen.page,
          selection: saveOpen.text,
        },
      });
      setSavedMsg("Draft saved. Access it from Profile → My Drafts.");
    } catch (e: any) {
      setSavedMsg(`Failed: ${e.message}`);
    } finally { setSaveOpen(null); setTimeout(() => setSavedMsg(null), 3000); }
  };

  const closeVideoModal = () => {
    Speech.stop();
    setSpeaking(false);
    setVideoOpen(null);
    setSolution(null);
  };

  return (
    <View style={styles.root} testID="pdf-viewer">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title || "PDF Paper"}</Text>
        <Pressable
          onPress={() => setSaveOpen({ text: "Manual bookmark", page: 1 })}
          testID="save-draft-btn"
        >
          <Ionicons name="bookmark-outline" size={20} color={theme.brand} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <WebView
          ref={webRef}
          testID="pdf-webview"
          originWhitelist={["*"]}
          source={{ html, baseUrl: BACKEND }}
          onMessage={onMessage}
          onLoadEnd={() => setLoading(false)}
          startInLoadingState
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
        />
        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={theme.brandPrimary} />
            <Text style={styles.loadTxt}>Loading paper…</Text>
          </View>
        )}
        <View style={styles.hint} pointerEvents="none">
          <Ionicons name="finger-print-outline" size={14} color="#fff" />
          <Text style={styles.hintTxt}>Highlight any question to use GC AI</Text>
        </View>
      </View>

      {savedMsg && (
        <View style={[styles.toast, { bottom: 16 + insets.bottom }]} testID="draft-toast">
          <Ionicons name="checkmark-circle" size={18} color={theme.success} />
          <Text style={styles.toastTxt}>{savedMsg}</Text>
        </View>
      )}

      {/* Ask GC AI confirmation */}
      <Modal visible={!!askOpen} transparent animationType="slide" onRequestClose={() => setAskOpen(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID="ask-sheet">
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Ask GC AI</Text>
            <Text style={styles.sheetSel} numberOfLines={5}>“{askOpen?.text}”</Text>
            <Pressable style={styles.primaryBtn} onPress={askGcAi} testID="confirm-ask">
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.primaryBtnTxt}>Open in AI chat</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => setAskOpen(null)} testID="cancel-ask">
              <Text style={styles.ghostBtnTxt}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Save draft */}
      <Modal visible={!!saveOpen} transparent animationType="slide" onRequestClose={() => setSaveOpen(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID="save-sheet">
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Save as draft</Text>
            <Text style={styles.sheetSel} numberOfLines={5}>{saveOpen?.text}</Text>
            <Pressable style={styles.primaryBtn} onPress={saveDraft} testID="confirm-save">
              <Ionicons name="bookmark" size={18} color="#fff" />
              <Text style={styles.primaryBtnTxt}>Save to My Drafts</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => setSaveOpen(null)} testID="cancel-save">
              <Text style={styles.ghostBtnTxt}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Video solution */}
      <Modal visible={!!videoOpen} transparent animationType="slide" onRequestClose={closeVideoModal}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetLg, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID="video-sheet">
            <View style={styles.grabber} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.sheetTitle}>Video Solution</Text>
              <Pressable onPress={closeVideoModal} testID="close-video"><Ionicons name="close" size={22} color={theme.onSurface} /></Pressable>
            </View>
            <Text style={styles.sheetSel} numberOfLines={4}>Question: “{videoOpen?.text}”</Text>

            {!solution && !solLoading && (
              <Pressable style={styles.primaryBtn} onPress={generateSolution} testID="generate-video">
                <Ionicons name="film-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnTxt}>Generate narrated solution</Text>
              </Pressable>
            )}
            {solLoading && (
              <View style={{ alignItems: "center", padding: spacing.lg }}>
                <ActivityIndicator color={theme.brandPrimary} />
                <Text style={{ marginTop: 8, color: theme.onSurfaceMuted }}>Solving with Claude Haiku 4.5…</Text>
              </View>
            )}
            {solution && (
              <View style={{ maxHeight: 380 }}>
                <View style={styles.playerCard}>
                  <View style={styles.playerScreen}>
                    <Ionicons name="film" size={48} color="#fff" style={{ opacity: 0.6 }} />
                    <Text style={styles.playerTitle} numberOfLines={2}>{solution.title}</Text>
                  </View>
                  <Pressable style={styles.playBtn} onPress={speak} testID="speak-btn">
                    <Ionicons name={speaking ? "stop" : "play"} size={18} color="#fff" />
                    <Text style={styles.playBtnTxt}>{speaking ? "Stop narration" : "Play narrated solution"}</Text>
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {solution.steps.map((s, i) => (
                    <View key={i} style={styles.stepCard}>
                      <View style={styles.stepNum}><Text style={styles.stepNumTxt}>{i + 1}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stepHead}>{humanize(s.heading)}</Text>
                        <Text style={styles.stepBody}>{humanize(s.body)}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: theme.divider,
  },
  title: { fontSize: 16, fontWeight: "800", color: theme.brand, flex: 1, textAlign: "center", marginHorizontal: 12 },
  loader: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface, gap: 8 },
  loadTxt: { color: theme.onSurfaceMuted },
  hint: {
    position: "absolute", left: 12, right: 12, bottom: 12, flexDirection: "row",
    alignItems: "center", gap: 6, alignSelf: "center", backgroundColor: "rgba(10,25,47,0.85)",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
  },
  hintTxt: { color: "#fff", fontSize: 12, fontWeight: "600" },
  toast: {
    position: "absolute", left: 16, right: 16, backgroundColor: "#fff",
    padding: 12, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: 8, ...shadow1,
  },
  toastTxt: { color: theme.onSurface, flex: 1 },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, gap: spacing.md,
  },
  sheetLg: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, gap: spacing.md, maxHeight: "88%",
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, opacity: 0.4 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: theme.onSurface },
  sheetSel: { color: theme.onSurfaceMuted, backgroundColor: theme.surface, padding: spacing.md, borderRadius: radii.md, fontStyle: "italic" },
  primaryBtn: {
    backgroundColor: theme.brandPrimary, paddingVertical: 14, borderRadius: radii.md,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
  },
  primaryBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  ghostBtn: { paddingVertical: 12, alignItems: "center" },
  ghostBtnTxt: { color: theme.onSurfaceMuted, fontWeight: "600" },
  playerCard: { backgroundColor: theme.brand, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
  playerScreen: {
    height: 120, backgroundColor: "#0F172A", borderRadius: radii.sm,
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  playerTitle: { color: "#fff", fontWeight: "700", textAlign: "center", paddingHorizontal: 12 },
  playBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.brandPrimary, paddingVertical: 12, borderRadius: radii.md,
  },
  playBtnTxt: { color: "#fff", fontWeight: "700" },
  stepCard: { flexDirection: "row", gap: 12, backgroundColor: theme.surface, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.sm },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.success, alignItems: "center", justifyContent: "center" },
  stepNumTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  stepHead: { fontWeight: "800", color: theme.onSurface, marginBottom: 3 },
  stepBody: { color: theme.onSurface, lineHeight: 20, fontSize: 13 },
});

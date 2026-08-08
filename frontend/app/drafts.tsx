import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

type Draft = {
  draft_id: string; paper_id: string; title: string; page: number;
  selection?: string | null; note?: string | null; updated_at: string;
  paper?: { pdf_url?: string; subject_name?: string; year?: number; title?: string };
};

export default function DraftsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Draft[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Draft[] }>("/drafts");
      setItems(r.items);
    } catch { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (id: string) => {
    await api(`/drafts/${id}`, { method: "DELETE" });
    setItems((prev) => (prev ? prev.filter((x) => x.draft_id !== id) : prev));
  };

  const open = (d: Draft) => {
    if (d.paper?.pdf_url) {
      router.push({
        pathname: "/pdf",
        params: { url: d.paper.pdf_url, title: d.paper.title || d.title, paper_id: d.paper_id },
      });
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="drafts-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
        <Text style={styles.title}>My Drafts</Text>
        <View style={{ width: 22 }} />
      </View>
      {items === null ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.brandPrimary} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={40} color={theme.onSurfaceMuted} />
          <Text style={styles.emptyT}>No drafts yet</Text>
          <Text style={styles.emptyS}>Open a PDF paper, highlight a question, and tap “Draft”.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.draft_id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
          renderItem={({ item: d }) => (
            <View style={styles.card} testID={`draft-${d.draft_id}`}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.cardT} numberOfLines={1}>{d.paper?.title || d.title}</Text>
                {d.selection ? (
                  <Text style={styles.sel} numberOfLines={3}>“{d.selection}”</Text>
                ) : null}
                <Text style={styles.meta}>Page {d.page} · saved {new Date(d.updated_at).toLocaleDateString()}</Text>
              </View>
              <View style={{ gap: 6 }}>
                <Pressable style={styles.openBtn} onPress={() => open(d)} testID={`open-${d.draft_id}`}>
                  <Text style={styles.openTxt}>Resume</Text>
                </Pressable>
                <Pressable style={styles.delBtn} onPress={() => del(d.draft_id)} testID={`delete-${d.draft_id}`}>
                  <Ionicons name="trash-outline" size={16} color={theme.error} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.brand },
  empty: { alignItems: "center", padding: spacing.xl, gap: 6 },
  emptyT: { fontWeight: "800", color: theme.onSurface, fontSize: 16 },
  emptyS: { color: theme.onSurfaceMuted, textAlign: "center" },
  card: { flexDirection: "row", gap: 12, backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md, ...shadow1 },
  cardT: { fontWeight: "800", color: theme.onSurface },
  sel: { color: theme.onSurfaceMuted, fontStyle: "italic", fontSize: 13 },
  meta: { color: theme.onSurfaceMuted, fontSize: 12 },
  openBtn: { backgroundColor: theme.brand, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
  openTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
  delBtn: { alignItems: "center", padding: 4 },
});

import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

type Lesson = {
  lesson_id: string; title: string; description: string;
  subject_name: string; exam_level: string;
  teacher_name: string; teacher_avatar?: string;
  thumbnail: string; duration: string; views: number; rating: number;
};

const LEVELS = ["All", "GCE O", "GCE A", "HND", "Concours"];

export default function Lessons() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Lesson[] | null>(null);
  const [level, setLevel] = useState("All");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const url = level === "All" ? "/lessons" : `/lessons?exam_level=${encodeURIComponent(level)}`;
      const r = await api<{ items: Lesson[] }>(url, { auth: false });
      setItems(r.items);
    } catch { setItems([]); }
  }, [level]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="lessons-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Lesson Videos</Text>
          <Text style={styles.sub}>Fresh uploads from Cameroon&apos;s best teachers</Text>
        </View>
        {user?.role === "teacher" && (
          <Pressable style={styles.upBtn} onPress={() => router.push("/teacher-upload")} testID="teacher-upload-btn">
            <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
            <Text style={styles.upTxt}>Upload</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.chipRow}>
        <FlatList
          horizontal
          data={LEVELS}
          keyExtractor={(x) => x}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}
          renderItem={({ item: l }) => {
            const active = level === l;
            return (
              <Pressable
                testID={`level-${l}`}
                onPress={() => setLevel(l)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{l}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {items === null ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.brandPrimary} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="videocam-outline" size={40} color={theme.onSurfaceMuted} />
          <Text style={styles.emptyTxt}>No lessons yet for {level}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.lesson_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brandPrimary} />}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 32 }}
          renderItem={({ item: c }) => (
            <Pressable
              testID={`lesson-${c.lesson_id}`}
              style={styles.card}
              onPress={() => router.push(`/lesson/${c.lesson_id}`)}
            >
              <View style={styles.thumbWrap}>
                <Image source={{ uri: c.thumbnail }} style={styles.thumb} contentFit="cover" />
                <View style={styles.playIcon}><Ionicons name="play" size={22} color="#fff" /></View>
                <View style={styles.durTag}><Text style={styles.durTxt}>{c.duration}</Text></View>
              </View>
              <View style={{ padding: spacing.md, gap: 4 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <View style={styles.pill}><Text style={styles.pillTxt}>{c.exam_level}</Text></View>
                  <View style={styles.pill}><Text style={styles.pillTxt}>{c.subject_name}</Text></View>
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>{c.title}</Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                  <View style={styles.row}><Ionicons name="person-outline" size={13} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{c.teacher_name}</Text></View>
                  <View style={styles.row}><Ionicons name="eye-outline" size={13} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{c.views}</Text></View>
                  <View style={styles.row}><Ionicons name="star" size={13} color={theme.warning} /><Text style={styles.meta}>{c.rating}</Text></View>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  title: { fontSize: 24, fontWeight: "800", color: theme.onSurface },
  sub: { color: theme.onSurfaceMuted, marginTop: 2 },
  upBtn: {
    flexDirection: "row", gap: 6, alignItems: "center",
    backgroundColor: theme.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
  },
  upTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
  chipRow: { height: 56, alignItems: "center" },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: 16, borderRadius: radii.pill,
    backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border,
    alignItems: "center", justifyContent: "center",
  },
  chipActive: { borderColor: theme.brandPrimary, backgroundColor: theme.brandTertiary },
  chipTxt: { color: theme.onSurface, fontWeight: "600", fontSize: 13 },
  chipTxtActive: { color: theme.brand },
  card: { backgroundColor: "#fff", borderRadius: radii.md, overflow: "hidden", ...shadow1 },
  thumbWrap: { position: "relative" },
  thumb: { width: "100%", height: 180, backgroundColor: theme.surfaceTertiary },
  playIcon: {
    position: "absolute", top: "50%", left: "50%", marginLeft: -22, marginTop: -22,
    width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(37,99,235,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  durTag: {
    position: "absolute", right: 8, bottom: 8, backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  durTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: theme.onSurface },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: theme.brandTertiary },
  pillTxt: { color: theme.onBrandTertiary, fontSize: 11, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: theme.onSurfaceMuted, fontSize: 12 },
  empty: { alignItems: "center", padding: spacing.xl, gap: 8 },
  emptyTxt: { color: theme.onSurfaceMuted },
});

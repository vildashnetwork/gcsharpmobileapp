import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

type Course = {
  course_id: string;
  title: string;
  subject_name: string;
  exam_level: string;
  teacher_name: string;
  teacher_avatar: string;
  thumbnail: string;
  duration: string;
  views: number;
  rating: number;
};

export default function Library() {
  const [items, setItems] = useState<Course[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ items: Course[] }>("/library/courses", { auth: false });
        setItems(r.items);
      } catch { setItems([]); }
    })();
  }, []);

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="library-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <Text style={styles.sub}>Video lessons and study materials</Text>
      </View>
      {items === null ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.brandPrimary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 32 }}>
          {items.map((c) => (
            <Pressable
              key={c.course_id}
              testID={`course-${c.course_id}`}
              style={styles.card}
              onPress={() => router.push(`/library/${c.course_id}`)}
            >
              <Image source={{ uri: c.thumbnail }} style={styles.thumb} contentFit="cover" />
              <View style={{ padding: spacing.md, gap: 6 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Chip label={c.exam_level} />
                  <Chip label={c.subject_name} />
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>{c.title}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <View style={styles.row}><Ionicons name="person-outline" size={14} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{c.teacher_name}</Text></View>
                  <View style={styles.row}><Ionicons name="time-outline" size={14} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{c.duration}</Text></View>
                  <View style={styles.row}><Ionicons name="star" size={14} color={theme.warning} /><Text style={styles.meta}>{c.rating}</Text></View>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}><Text style={styles.chipTxt}>{label}</Text></View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 24, fontWeight: "800", color: theme.onSurface },
  sub: { color: theme.onSurfaceMuted, marginTop: 2 },
  card: { backgroundColor: "#fff", borderRadius: radii.md, overflow: "hidden", ...shadow1 },
  thumb: { width: "100%", height: 160, backgroundColor: theme.surfaceTertiary },
  cardTitle: { fontSize: 16, fontWeight: "700", color: theme.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: theme.onSurfaceMuted, fontSize: 12 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: theme.brandTertiary },
  chipTxt: { color: theme.onBrandTertiary, fontSize: 11, fontWeight: "700" },
});

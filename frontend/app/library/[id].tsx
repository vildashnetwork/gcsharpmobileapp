import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

export default function CourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = useState<any>(null);
  const [tab, setTab] = useState<"Methodology" | "Chapters" | "Practice">("Methodology");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const r = await api<{ course: any }>(`/library/courses/${id}`, { auth: false });
      setCourse(r.course);
    })();
  }, [id]);

  if (!course) return <SafeAreaView style={styles.root}><ActivityIndicator style={{ marginTop: 60 }} color={theme.brandPrimary} /></SafeAreaView>;

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="course-detail">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
        <Text style={styles.brand}>GCSMART</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.player}>
          <Image source={{ uri: course.thumbnail }} style={styles.thumb} contentFit="cover" />
          <View style={styles.playOverlay}>
            <View style={styles.playBtn}><Ionicons name="play" size={26} color="#fff" /></View>
          </View>
          <View style={styles.liveBadge}><Text style={styles.liveTxt}>AI ANALYSIS LIVE</Text></View>
        </View>

        <View style={{ padding: spacing.lg, gap: 6 }}>
          <Text style={styles.courseT}>{course.title}</Text>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Text style={styles.meta}>{course.teacher_name}</Text>
            <Text style={styles.meta}>· {course.duration}</Text>
            <Text style={styles.meta}>· ⭐ {course.rating}</Text>
          </View>
          <Text style={styles.desc}>{course.description}</Text>
        </View>

        <View style={styles.tabs}>
          {(["Methodology", "Chapters", "Practice"] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={styles.tab} testID={`tab-${t}`}>
              <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>{t}</Text>
              {tab === t && <View style={styles.tabBar} />}
            </Pressable>
          ))}
        </View>

        {tab === "Methodology" && (
          <View style={{ padding: spacing.lg, gap: spacing.sm }}>
            <Text style={styles.section}>Expert Strategy</Text>
            {(course.methodology || []).map((m: any, i: number) => (
              <View key={i} style={styles.stepCard}>
                <View style={styles.stepNum}><Text style={styles.stepNumTxt}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{m.title}</Text>
                  <Text style={styles.stepText}>{m.text}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {tab === "Chapters" && (
          <View style={{ padding: spacing.lg, gap: spacing.sm }}>
            {(course.chapters || []).map((c: any, i: number) => (
              <View key={i} style={styles.chapter}>
                <View style={styles.chapNum}><Text style={styles.chapNumTxt}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{c.title}</Text>
                  <Text style={styles.meta}>{c.duration}</Text>
                </View>
                <Ionicons name="play-circle" size={26} color={theme.brandPrimary} />
              </View>
            ))}
          </View>
        )}

        {tab === "Practice" && (
          <View style={{ padding: spacing.lg }}>
            <Pressable style={styles.practice} onPress={() => router.push("/past-questions")} testID="practice-btn">
              <Ionicons name="document-text-outline" size={22} color={theme.brand} />
              <Text style={styles.practiceTxt}>Practice past questions on this topic</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceMuted} />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  brand: { fontSize: 16, fontWeight: "800", color: theme.brand, letterSpacing: 1 },
  player: { position: "relative", height: 220, backgroundColor: theme.brand },
  thumb: { width: "100%", height: "100%", opacity: 0.6 },
  playOverlay: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(37,99,235,0.9)", alignItems: "center", justifyContent: "center" },
  liveBadge: { position: "absolute", top: 12, right: 12, backgroundColor: theme.brandPrimary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  liveTxt: { color: "#fff", fontWeight: "800", fontSize: 10 },
  courseT: { fontSize: 20, fontWeight: "800", color: theme.onSurface },
  meta: { color: theme.onSurfaceMuted, fontSize: 12 },
  desc: { color: theme.onSurface, marginTop: 6, lineHeight: 21 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.divider, backgroundColor: "#fff" },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center", position: "relative" },
  tabTxt: { fontWeight: "600", color: theme.onSurfaceMuted },
  tabTxtActive: { color: theme.brand },
  tabBar: { position: "absolute", bottom: 0, left: 20, right: 20, height: 3, backgroundColor: theme.brand, borderRadius: 3 },
  section: { fontSize: 16, fontWeight: "800", color: theme.onSurface },
  stepCard: { flexDirection: "row", backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md, ...shadow1, gap: 12, alignItems: "flex-start" },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.success, alignItems: "center", justifyContent: "center" },
  stepNumTxt: { color: "#fff", fontWeight: "800" },
  stepTitle: { fontWeight: "700", color: theme.onSurface, marginBottom: 4 },
  stepText: { color: theme.onSurfaceMuted, lineHeight: 20, fontSize: 13 },
  chapter: { flexDirection: "row", backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md, ...shadow1, gap: 12, alignItems: "center" },
  chapNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.brandTertiary, alignItems: "center", justifyContent: "center" },
  chapNumTxt: { color: theme.brand, fontWeight: "800" },
  practice: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", padding: spacing.lg, borderRadius: radii.md, ...shadow1 },
  practiceTxt: { flex: 1, fontWeight: "700", color: theme.onSurface },
});

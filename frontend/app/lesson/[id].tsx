import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

export default function LessonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [lesson, setLesson] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const r = await api<{ lesson: any }>(`/lessons/${id}`, { auth: false });
      setLesson(r.lesson);
    })();
  }, [id]);

  const player = useVideoPlayer(lesson?.video_url ?? null, (p) => {
    if (lesson?.video_url) {
      p.loop = false;
      p.play();
    }
  });

  if (!lesson) {
    return <SafeAreaView style={styles.root}><ActivityIndicator style={{ marginTop: 60 }} color={theme.brandPrimary} /></SafeAreaView>;
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="lesson-detail">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>
        <Text style={styles.brand}>GCSHARP</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <VideoView
          player={player}
          style={styles.video}
          allowsFullscreen
          allowsPictureInPicture
          contentFit="contain"
          nativeControls
        />
        <View style={{ padding: spacing.lg, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <View style={styles.pill}><Text style={styles.pillTxt}>{lesson.exam_level}</Text></View>
            <View style={styles.pill}><Text style={styles.pillTxt}>{lesson.subject_name}</Text></View>
          </View>
          <Text style={styles.title}>{lesson.title}</Text>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <View style={styles.row}><Ionicons name="person-outline" size={14} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{lesson.teacher_name}</Text></View>
            <View style={styles.row}><Ionicons name="eye-outline" size={14} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{lesson.views} views</Text></View>
            <View style={styles.row}><Ionicons name="star" size={14} color={theme.warning} /><Text style={styles.meta}>{lesson.rating}</Text></View>
            <View style={styles.row}><Ionicons name="time-outline" size={14} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{lesson.duration}</Text></View>
          </View>
          <Text style={styles.desc}>{lesson.description}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  brand: { fontSize: 16, fontWeight: "800", color: theme.brand, letterSpacing: 1 },
  video: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  title: { fontSize: 20, fontWeight: "800", color: theme.onSurface, marginTop: 4 },
  desc: { color: theme.onSurface, lineHeight: 21, marginTop: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: theme.brandTertiary },
  pillTxt: { color: theme.onBrandTertiary, fontSize: 11, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: theme.onSurfaceMuted, fontSize: 12 },
});

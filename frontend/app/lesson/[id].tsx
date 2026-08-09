// import { useEffect, useState } from "react";
// import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useLocalSearchParams, useRouter } from "expo-router";
// import { useVideoPlayer, VideoView } from "expo-video";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { api } from "@/src/api";

// export default function LessonDetail() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const router = useRouter();
//   const [lesson, setLesson] = useState<any>(null);

//   useEffect(() => {
//     (async () => {
//       const r = await api<{ lesson: any }>(`/lessons/${id}`, { auth: false });
//       setLesson(r.lesson);
//     })();
//   }, [id]);

//   const player = useVideoPlayer(lesson?.video_url ?? null, (p) => {
//     if (lesson?.video_url) {
//       p.loop = false;
//       p.play();
//     }
//   });

//   if (!lesson) {
//     return <SafeAreaView style={styles.root}><ActivityIndicator style={{ marginTop: 60 }} color={theme.brandPrimary} /></SafeAreaView>;
//   }

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="lesson-detail">
//       <View style={styles.header}>
//         <Pressable onPress={() => router.back()} testID="back-btn">
//           <Ionicons name="arrow-back" size={22} color={theme.brand} />
//         </Pressable>
//         <Text style={styles.brand}>GCSHARP</Text>
//         <View style={{ width: 22 }} />
//       </View>
//       <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
//         <VideoView
//           player={player}
//           style={styles.video}
//           allowsFullscreen
//           allowsPictureInPicture
//           contentFit="contain"
//           nativeControls
//         />
//         <View style={{ padding: spacing.lg, gap: 8 }}>
//           <View style={{ flexDirection: "row", gap: 6 }}>
//             <View style={styles.pill}><Text style={styles.pillTxt}>{lesson.exam_level}</Text></View>
//             <View style={styles.pill}><Text style={styles.pillTxt}>{lesson.subject_name}</Text></View>
//           </View>
//           <Text style={styles.title}>{lesson.title}</Text>
//           <View style={{ flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
//             <View style={styles.row}><Ionicons name="person-outline" size={14} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{lesson.teacher_name}</Text></View>
//             <View style={styles.row}><Ionicons name="eye-outline" size={14} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{lesson.views} views</Text></View>
//             <View style={styles.row}><Ionicons name="star" size={14} color={theme.warning} /><Text style={styles.meta}>{lesson.rating}</Text></View>
//             <View style={styles.row}><Ionicons name="time-outline" size={14} color={theme.onSurfaceMuted} /><Text style={styles.meta}>{lesson.duration}</Text></View>
//           </View>
//           <Text style={styles.desc}>{lesson.description}</Text>
//         </View>
//       </ScrollView>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
//   brand: { fontSize: 16, fontWeight: "800", color: theme.brand, letterSpacing: 1 },
//   video: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
//   title: { fontSize: 20, fontWeight: "800", color: theme.onSurface, marginTop: 4 },
//   desc: { color: theme.onSurface, lineHeight: 21, marginTop: 6 },
//   pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: theme.brandTertiary },
//   pillTxt: { color: theme.onBrandTertiary, fontSize: 11, fontWeight: "700" },
//   row: { flexDirection: "row", alignItems: "center", gap: 4 },
//   meta: { color: theme.onSurfaceMuted, fontSize: 12 },
// });


















import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

type Lesson = {
  id?: string;
  course_id?: string;
  title: string;
  description: string;
  subject_name: string;
  exam_level: string;
  teacher_name: string;
  teacher_avatar?: string;
  thumbnail?: string;
  duration: string;
  views: number;
  rating: number;
  video_url: string;
};

// Matches the shape returned by /library/courses (see Library screen) —
// reused here for the "Similar videos" rail since there's no dedicated
// /lessons/:id/related endpoint yet. If one gets added later, swap the
// fetch in loadSimilar() below for that instead of this filter-on-client
// approach.
type SimilarCourse = {
  course_id: string;
  title: string;
  subject_name: string;
  exam_level: string;
  teacher_name: string;
  thumbnail: string;
  duration: string;
  views: number;
};

const DESCRIPTION_COLLAPSED_LINES = 3;

function formatViews(n: number | undefined): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M views`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K views`;
  return `${v} view${v === 1 ? "" : "s"}`;
}

function useShimmer() {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim;
}

function DetailSkeleton() {
  const opacity = useShimmer();
  return (
    <View>
      <Animated.View style={[styles.video, { opacity, backgroundColor: theme.surfaceTertiary }]} />
      <View style={{ padding: spacing.lg, gap: 10 }}>
        <Animated.View style={[styles.skeletonBlock, { opacity, width: "85%", height: 20, borderRadius: 4 }]} />
        <Animated.View style={[styles.skeletonBlock, { opacity, width: "50%", height: 14, borderRadius: 4 }]} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
          <Animated.View style={[styles.skeletonBlock, { opacity, width: 40, height: 40, borderRadius: 20 }]} />
          <Animated.View style={[styles.skeletonBlock, { opacity, width: "40%", height: 14, borderRadius: 4 }]} />
        </View>
      </View>
    </View>
  );
}

function SimilarRowSkeleton() {
  const opacity = useShimmer();
  return (
    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 8 }}>
      <Animated.View style={[styles.skeletonBlock, { opacity, width: 150, height: 84, borderRadius: 8 }]} />
      <View style={{ flex: 1, gap: 6, paddingTop: 2 }}>
        <Animated.View style={[styles.skeletonBlock, { opacity, width: "90%", height: 13, borderRadius: 4 }]} />
        <Animated.View style={[styles.skeletonBlock, { opacity, width: "60%", height: 13, borderRadius: 4 }]} />
        <Animated.View style={[styles.skeletonBlock, { opacity, width: "40%", height: 11, borderRadius: 4 }]} />
      </View>
    </View>
  );
}

export default function LessonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [similar, setSimilar] = useState<SimilarCourse[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  useEffect(() => {
    setLesson(null);
    setDescExpanded(false);
    setSimilar([]);
    (async () => {
      const r = await api<{ lesson: Lesson }>(`/lessons/${id}`, { auth: false });
      setLesson(r.lesson);
    })();
  }, [id]);

  // Fetch similar videos once we know the current lesson's subject/level —
  // filtered client-side against the same /library/courses list the
  // Library screen already uses, excluding the lesson currently playing.
  const loadSimilar = useCallback(async (current: Lesson) => {
    try {
      setLoadingSimilar(true);
      const url = `/library/courses?exam_level=${encodeURIComponent(current.exam_level)}`;
      const r = await api<{ items: SimilarCourse[] }>(url, { auth: false });
      const currentId = current.course_id ?? current.id;
      const ranked = (r.items || [])
        .filter((c) => c.course_id !== currentId)
        .sort((a, b) => {
          // Same subject first, then by views, mirroring a simple
          // "most relevant, then most popular" ordering.
          const aMatch = a.subject_name === current.subject_name ? 1 : 0;
          const bMatch = b.subject_name === current.subject_name ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
          return (b.views || 0) - (a.views || 0);
        });
      setSimilar(ranked);
    } catch (error) {
      console.error("[LessonDetail] Failed to load similar videos:", error);
      setSimilar([]);
    } finally {
      setLoadingSimilar(false);
    }
  }, []);

  useEffect(() => {
    if (lesson) loadSimilar(lesson);
  }, [lesson, loadSimilar]);

  const player = useVideoPlayer(lesson?.video_url ?? null, (p) => {
    if (lesson?.video_url) {
      p.loop = false;
      p.play();
    }
  });

  const openSimilar = useCallback(
    (item: SimilarCourse) => {
      // Assumes this screen lives at a route like app/lessons/[id].tsx,
      // matching the /lessons/:id fetch above. If your related-video
      // cards should instead point at a /library/[id] route, change the
      // pathname here to match.
      router.push(`/lessons/${item.course_id}`);
    },
    [router]
  );

  if (!lesson) {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="back-btn">
            <Ionicons name="arrow-back" size={22} color={theme.brand} />
          </Pressable>
          <Text style={styles.brand}>GCSHARP</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <DetailSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
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

      {/* Player stays pinned above the scrolling content, YouTube-style —
          only the info + channel row + description + similar list scroll. */}
      <VideoView
        player={player}
        style={styles.video}
        allowsFullscreen
        allowsPictureInPicture
        contentFit="contain"
        nativeControls
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ padding: spacing.lg, gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <View style={styles.pill}><Text style={styles.pillTxt}>{lesson.exam_level}</Text></View>
            <View style={styles.pill}><Text style={styles.pillTxt}>{lesson.subject_name}</Text></View>
          </View>

          <Text style={styles.title}>{lesson.title}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.meta}>{formatViews(lesson.views)}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Ionicons name="star" size={13} color={theme.warning} />
            <Text style={styles.meta}>{(lesson.rating ?? 5).toFixed(1)}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Ionicons name="time-outline" size={13} color={theme.onSurfaceMuted} />
            <Text style={styles.meta}>{lesson.duration}</Text>
          </View>

          {/* Channel row — avatar + name + a tap target, YouTube's
              standard layout beneath the title. */}
          <View style={styles.channelRow}>
            {lesson.teacher_avatar ? (
              <Image source={{ uri: lesson.teacher_avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(lesson.teacher_name || "T").charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.teacherName} numberOfLines={1}>{lesson.teacher_name || "GC Teacher"}</Text>
              <Text style={styles.teacherSub} numberOfLines={1}>{lesson.subject_name} teacher</Text>
            </View>
          </View>

          {/* Expandable description */}
          {!!lesson.description && (
            <Pressable onPress={() => setDescExpanded((v) => !v)} style={styles.descBox}>
              <Text
                style={styles.desc}
                numberOfLines={descExpanded ? undefined : DESCRIPTION_COLLAPSED_LINES}
              >
                {lesson.description}
              </Text>
              <Text style={styles.showMore}>{descExpanded ? "Show less" : "Show more"}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.divider} />

        {/* Similar videos — "Up next" style vertical rail below the
            player and description, like YouTube's mobile layout. */}
        <View style={{ paddingTop: spacing.md }}>
          <Text style={styles.sectionTitle}>Similar videos</Text>

          {loadingSimilar ? (
            <>
              <SimilarRowSkeleton />
              <SimilarRowSkeleton />
              <SimilarRowSkeleton />
            </>
          ) : similar.length === 0 ? (
            <Text style={styles.emptySimilar}>No similar videos yet.</Text>
          ) : (
            similar.map((item) => (
              <Pressable
                key={item.course_id}
                testID={`similar-${item.course_id}`}
                style={styles.similarRow}
                onPress={() => openSimilar(item)}
              >
                <View style={styles.similarThumbWrap}>
                  <Image source={{ uri: item.thumbnail }} style={styles.similarThumb} />
                  <View style={styles.similarDurTag}>
                    <Text style={styles.similarDurTxt}>{item.duration || "45:00"}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.similarTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.similarMeta} numberOfLines={1}>{item.teacher_name || "GC Teacher"}</Text>
                  <Text style={styles.similarMeta}>{formatViews(item.views)} · {item.subject_name}</Text>
                </View>
              </Pressable>
            ))
          )}
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
  skeletonBlock: { backgroundColor: theme.surfaceTertiary },

  title: { fontSize: 19, fontWeight: "800", color: theme.onSurface, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  meta: { color: theme.onSurfaceMuted, fontSize: 12.5 },
  metaDot: { color: theme.onSurfaceMuted, fontSize: 12, marginHorizontal: 2 },

  channelRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: theme.brandTertiary },
  avatarInitial: { color: theme.onBrandTertiary, fontWeight: "800", fontSize: 16 },
  teacherName: { color: theme.onSurface, fontWeight: "700", fontSize: 14 },
  teacherSub: { color: theme.onSurfaceMuted, fontSize: 12, marginTop: 1 },

  descBox: { backgroundColor: theme.surfaceTertiary, borderRadius: radii.md, padding: 12, marginTop: 12, gap: 6 },
  desc: { color: theme.onSurface, lineHeight: 20, fontSize: 13.5 },
  showMore: { color: theme.brandPrimary, fontWeight: "700", fontSize: 12.5 },

  divider: { height: 8, backgroundColor: theme.surfaceTertiary, marginTop: spacing.md },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: theme.onSurface, paddingHorizontal: spacing.lg, marginBottom: 4 },
  emptySimilar: { color: theme.onSurfaceMuted, fontSize: 13, paddingHorizontal: spacing.lg, paddingVertical: 12 },

  similarRow: { flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  similarThumbWrap: { position: "relative", ...shadow1 },
  similarThumb: { width: 150, height: 84, borderRadius: 8, backgroundColor: theme.surfaceTertiary },
  similarDurTag: {
    position: "absolute", right: 4, bottom: 4, backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4,
  },
  similarDurTxt: { color: "#fff", fontSize: 10, fontWeight: "700" },
  similarTitle: { color: theme.onSurface, fontWeight: "700", fontSize: 13.5, lineHeight: 18 },
  similarMeta: { color: theme.onSurfaceMuted, fontSize: 12 },

  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: theme.brandTertiary },
  pillTxt: { color: theme.onBrandTertiary, fontSize: 11, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
});
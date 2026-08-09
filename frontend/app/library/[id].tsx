// import { useEffect, useState } from "react";
// import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Image } from "expo-image";
// import { Ionicons } from "@expo/vector-icons";
// import { useLocalSearchParams, useRouter } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { api } from "@/src/api";

// export default function CourseDetail() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const [course, setCourse] = useState<any>(null);
//   const [tab, setTab] = useState<"Methodology" | "Chapters" | "Practice">("Methodology");
//   const router = useRouter();

//   useEffect(() => {
//     (async () => {
//       const r = await api<{ course: any }>(`/library/courses/${id}`, { auth: false });
//       setCourse(r.course);
//     })();
//   }, [id]);

//   if (!course) return <SafeAreaView style={styles.root}><ActivityIndicator style={{ marginTop: 60 }} color={theme.brandPrimary} /></SafeAreaView>;

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="course-detail">
//       <View style={styles.header}>
//         <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
//         <Text style={styles.brand}>GCSHARP</Text>
//         <View style={{ width: 22 }} />
//       </View>
//       <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
//         <View style={styles.player}>
//           <Image source={{ uri: course.thumbnail }} style={styles.thumb} contentFit="cover" />
//           <View style={styles.playOverlay}>
//             <View style={styles.playBtn}><Ionicons name="play" size={26} color="#fff" /></View>
//           </View>
//           <View style={styles.liveBadge}><Text style={styles.liveTxt}>AI ANALYSIS LIVE</Text></View>
//         </View>

//         <View style={{ padding: spacing.lg, gap: 6 }}>
//           <Text style={styles.courseT}>{course.title}</Text>
//           <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
//             <Text style={styles.meta}>{course.teacher_name}</Text>
//             <Text style={styles.meta}>· {course.duration}</Text>
//             <Text style={styles.meta}>· ⭐ {course.rating}</Text>
//           </View>
//           <Text style={styles.desc}>{course.description}</Text>
//         </View>

//         <View style={styles.tabs}>
//           {(["Methodology", "Chapters", "Practice"] as const).map((t) => (
//             <Pressable key={t} onPress={() => setTab(t)} style={styles.tab} testID={`tab-${t}`}>
//               <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>{t}</Text>
//               {tab === t && <View style={styles.tabBar} />}
//             </Pressable>
//           ))}
//         </View>

//         {tab === "Methodology" && (
//           <View style={{ padding: spacing.lg, gap: spacing.sm }}>
//             <Text style={styles.section}>Expert Strategy</Text>
//             {(course.methodology || []).map((m: any, i: number) => (
//               <View key={i} style={styles.stepCard}>
//                 <View style={styles.stepNum}><Text style={styles.stepNumTxt}>{i + 1}</Text></View>
//                 <View style={{ flex: 1 }}>
//                   <Text style={styles.stepTitle}>{m.title}</Text>
//                   <Text style={styles.stepText}>{m.text}</Text>
//                 </View>
//               </View>
//             ))}
//           </View>
//         )}

//         {tab === "Chapters" && (
//           <View style={{ padding: spacing.lg, gap: spacing.sm }}>
//             {(course.chapters || []).map((c: any, i: number) => (
//               <View key={i} style={styles.chapter}>
//                 <View style={styles.chapNum}><Text style={styles.chapNumTxt}>{i + 1}</Text></View>
//                 <View style={{ flex: 1 }}>
//                   <Text style={styles.stepTitle}>{c.title}</Text>
//                   <Text style={styles.meta}>{c.duration}</Text>
//                 </View>
//                 <Ionicons name="play-circle" size={26} color={theme.brandPrimary} />
//               </View>
//             ))}
//           </View>
//         )}

//         {tab === "Practice" && (
//           <View style={{ padding: spacing.lg }}>
//             <Pressable style={styles.practice} onPress={() => router.push("/past-questions")} testID="practice-btn">
//               <Ionicons name="document-text-outline" size={22} color={theme.brand} />
//               <Text style={styles.practiceTxt}>Practice past questions on this topic</Text>
//               <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceMuted} />
//             </Pressable>
//           </View>
//         )}
//       </ScrollView>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
//   brand: { fontSize: 16, fontWeight: "800", color: theme.brand, letterSpacing: 1 },
//   player: { position: "relative", height: 220, backgroundColor: theme.brand },
//   thumb: { width: "100%", height: "100%", opacity: 0.6 },
//   playOverlay: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" },
//   playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(37,99,235,0.9)", alignItems: "center", justifyContent: "center" },
//   liveBadge: { position: "absolute", top: 12, right: 12, backgroundColor: theme.brandPrimary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
//   liveTxt: { color: "#fff", fontWeight: "800", fontSize: 10 },
//   courseT: { fontSize: 20, fontWeight: "800", color: theme.onSurface },
//   meta: { color: theme.onSurfaceMuted, fontSize: 12 },
//   desc: { color: theme.onSurface, marginTop: 6, lineHeight: 21 },
//   tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.divider, backgroundColor: "#fff" },
//   tab: { flex: 1, paddingVertical: 14, alignItems: "center", position: "relative" },
//   tabTxt: { fontWeight: "600", color: theme.onSurfaceMuted },
//   tabTxtActive: { color: theme.brand },
//   tabBar: { position: "absolute", bottom: 0, left: 20, right: 20, height: 3, backgroundColor: theme.brand, borderRadius: 3 },
//   section: { fontSize: 16, fontWeight: "800", color: theme.onSurface },
//   stepCard: { flexDirection: "row", backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md, ...shadow1, gap: 12, alignItems: "flex-start" },
//   stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.success, alignItems: "center", justifyContent: "center" },
//   stepNumTxt: { color: "#fff", fontWeight: "800" },
//   stepTitle: { fontWeight: "700", color: theme.onSurface, marginBottom: 4 },
//   stepText: { color: theme.onSurfaceMuted, lineHeight: 20, fontSize: 13 },
//   chapter: { flexDirection: "row", backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md, ...shadow1, gap: 12, alignItems: "center" },
//   chapNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.brandTertiary, alignItems: "center", justifyContent: "center" },
//   chapNumTxt: { color: theme.brand, fontWeight: "800" },
//   practice: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", padding: spacing.lg, borderRadius: radii.md, ...shadow1 },
//   practiceTxt: { flex: 1, fontWeight: "700", color: theme.onSurface },
// });



































import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

type Course = {
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
  methodology?: { title: string; text: string }[];
  chapters?: { title: string; duration: string }[];
};

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

export default function CourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [similar, setSimilar] = useState<SimilarCourse[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  useEffect(() => {
    setCourse(null);
    setDescExpanded(false);
    setSimilar([]);
    (async () => {
      const r = await api<{ course: Course }>(`/library/courses/${id}`, { auth: false });
      setCourse(r.course);
    })();
  }, [id]);

  const loadSimilar = useCallback(async (current: Course) => {
    try {
      setLoadingSimilar(true);
      const url = `/library/courses?exam_level=${encodeURIComponent(current.exam_level)}`;
      const r = await api<{ items: SimilarCourse[] }>(url, { auth: false });
      const currentId = current.course_id ?? current.id;
      const ranked = (r.items || [])
        .filter((c) => c.course_id !== currentId)
        .sort((a, b) => {
          const aMatch = a.subject_name === current.subject_name ? 1 : 0;
          const bMatch = b.subject_name === current.subject_name ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
          return (b.views || 0) - (a.views || 0);
        });
      setSimilar(ranked);
    } catch (error) {
      console.error("[CourseDetail] Failed to load similar courses:", error);
      setSimilar([]);
    } finally {
      setLoadingSimilar(false);
    }
  }, []);

  useEffect(() => {
    if (course) loadSimilar(course);
  }, [course, loadSimilar]);

  const player = useVideoPlayer(course?.video_url ?? null, (p) => {
    if (course?.video_url) {
      p.loop = false;
      p.play();
    }
  });

  const openSimilar = useCallback(
    (item: SimilarCourse) => {
      router.push(`/library/${item.course_id}`);
    },
    [router]
  );

  if (!course) {
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
    <SafeAreaView edges={["top"]} style={styles.root} testID="course-detail">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={22} color={theme.brand} />
        </Pressable>
        <Text style={styles.brand}>GCSHARP</Text>
        <View style={{ width: 22 }} />
      </View>

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
            <View style={styles.pill}><Text style={styles.pillTxt}>{course.exam_level}</Text></View>
            <View style={styles.pill}><Text style={styles.pillTxt}>{course.subject_name}</Text></View>
          </View>

          <Text style={styles.title}>{course.title}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.meta}>{formatViews(course.views)}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Ionicons name="star" size={13} color={theme.warning} />
            <Text style={styles.meta}>{(course.rating ?? 5).toFixed(1)}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Ionicons name="time-outline" size={13} color={theme.onSurfaceMuted} />
            <Text style={styles.meta}>{course.duration}</Text>
          </View>

          <View style={styles.channelRow}>
            {course.teacher_avatar ? (
              <Image source={{ uri: course.teacher_avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(course.teacher_name || "T").charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.teacherName} numberOfLines={1}>{course.teacher_name || "GC Teacher"}</Text>
              <Text style={styles.teacherSub} numberOfLines={1}>{course.subject_name} teacher</Text>
            </View>
          </View>

          {!!course.description && (
            <Pressable onPress={() => setDescExpanded((v) => !v)} style={styles.descBox}>
              <Text
                style={styles.desc}
                numberOfLines={descExpanded ? undefined : DESCRIPTION_COLLAPSED_LINES}
              >
                {course.description}
              </Text>
              <Text style={styles.showMore}>{descExpanded ? "Show less" : "Show more"}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.divider} />

        {course.methodology && course.methodology.length > 0 && (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <Text style={styles.sectionTitle}>Methodology</Text>
            {course.methodology.map((m: any, i: number) => (
              <View key={i} style={styles.stepCard}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumTxt}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{m.title}</Text>
                  <Text style={styles.stepText}>{m.text}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {course.chapters && course.chapters.length > 0 && (
          <>
            <View style={styles.divider} />
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
              <Text style={styles.sectionTitle}>Chapters</Text>
              {course.chapters.map((c: any, i: number) => (
                <View key={i} style={styles.chapter}>
                  <View style={styles.chapNum}>
                    <Text style={styles.chapNumTxt}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{c.title}</Text>
                    <Text style={styles.meta}>{c.duration}</Text>
                  </View>
                  <Ionicons name="play-circle" size={26} color={theme.brandPrimary} />
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.divider} />

        <View style={{ paddingTop: spacing.md }}>
          <Text style={styles.sectionTitle}>Similar courses</Text>

          {loadingSimilar ? (
            <>
              <SimilarRowSkeleton />
              <SimilarRowSkeleton />
              <SimilarRowSkeleton />
            </>
          ) : similar.length === 0 ? (
            <Text style={styles.emptySimilar}>No similar courses yet.</Text>
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

  stepCard: { flexDirection: "row", backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md, ...shadow1, gap: 12, alignItems: "flex-start", marginTop: 8 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.success, alignItems: "center", justifyContent: "center" },
  stepNumTxt: { color: "#fff", fontWeight: "800" },
  stepTitle: { fontWeight: "700", color: theme.onSurface, marginBottom: 4 },
  stepText: { color: theme.onSurfaceMuted, lineHeight: 20, fontSize: 13 },

  chapter: { flexDirection: "row", backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md, ...shadow1, gap: 12, alignItems: "center", marginTop: 8 },
  chapNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.brandTertiary, alignItems: "center", justifyContent: "center" },
  chapNumTxt: { color: theme.brand, fontWeight: "800" },
});
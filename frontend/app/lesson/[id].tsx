
// import { useEffect, useState, useCallback, useRef } from "react";
// import { View, Text, StyleSheet, Pressable, ScrollView, Image, Animated, Easing } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useLocalSearchParams, useRouter } from "expo-router";
// import { useVideoPlayer, VideoView } from "expo-video";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
// import { api } from "@/src/api";

// type Lesson = {
//   id?: string;
//   course_id?: string;
//   title: string;
//   description: string;
//   subject_name: string;
//   exam_level: string;
//   teacher_name: string;
//   teacher_avatar?: string;
//   thumbnail?: string;
//   duration: string;
//   views: number;
//   rating: number;
//   video_url: string;
// };

// // Matches the shape returned by /library/courses (see Library screen) —
// // reused here for the "Similar videos" rail since there's no dedicated
// // /lessons/:id/related endpoint yet. If one gets added later, swap the
// // fetch in loadSimilar() below for that instead of this filter-on-client
// // approach.
// type SimilarCourse = {
//   course_id: string;
//   title: string;
//   subject_name: string;
//   exam_level: string;
//   teacher_name: string;
//   thumbnail: string;
//   duration: string;
//   views: number;
// };

// const DESCRIPTION_COLLAPSED_LINES = 3;

// function formatViews(n: number | undefined): string {
//   const v = n ?? 0;
//   if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M views`;
//   if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K views`;
//   return `${v} view${v === 1 ? "" : "s"}`;
// }

// function useShimmer() {
//   const anim = useRef(new Animated.Value(0.35)).current;
//   useEffect(() => {
//     const loop = Animated.loop(
//       Animated.sequence([
//         Animated.timing(anim, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
//         Animated.timing(anim, { toValue: 0.35, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
//       ])
//     );
//     loop.start();
//     return () => loop.stop();
//   }, [anim]);
//   return anim;
// }

// function DetailSkeleton() {
//   const opacity = useShimmer();
//   return (
//     <View>
//       <Animated.View style={[styles.video, { opacity, backgroundColor: theme.surfaceTertiary }]} />
//       <View style={{ padding: spacing.lg, gap: 10 }}>
//         <Animated.View style={[styles.skeletonBlock, { opacity, width: "85%", height: 20, borderRadius: 4 }]} />
//         <Animated.View style={[styles.skeletonBlock, { opacity, width: "50%", height: 14, borderRadius: 4 }]} />
//         <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
//           <Animated.View style={[styles.skeletonBlock, { opacity, width: 40, height: 40, borderRadius: 20 }]} />
//           <Animated.View style={[styles.skeletonBlock, { opacity, width: "40%", height: 14, borderRadius: 4 }]} />
//         </View>
//       </View>
//     </View>
//   );
// }

// function SimilarRowSkeleton() {
//   const opacity = useShimmer();
//   return (
//     <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 8 }}>
//       <Animated.View style={[styles.skeletonBlock, { opacity, width: 150, height: 84, borderRadius: 8 }]} />
//       <View style={{ flex: 1, gap: 6, paddingTop: 2 }}>
//         <Animated.View style={[styles.skeletonBlock, { opacity, width: "90%", height: 13, borderRadius: 4 }]} />
//         <Animated.View style={[styles.skeletonBlock, { opacity, width: "60%", height: 13, borderRadius: 4 }]} />
//         <Animated.View style={[styles.skeletonBlock, { opacity, width: "40%", height: 11, borderRadius: 4 }]} />
//       </View>
//     </View>
//   );
// }

// export default function LessonDetail() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const router = useRouter();
//   const [lesson, setLesson] = useState<Lesson | null>(null);
//   const [descExpanded, setDescExpanded] = useState(false);
//   const [similar, setSimilar] = useState<SimilarCourse[]>([]);
//   const [loadingSimilar, setLoadingSimilar] = useState(false);

//   useEffect(() => {
//     setLesson(null);
//     setDescExpanded(false);
//     setSimilar([]);
//     (async () => {
//       const r = await api<{ lesson: Lesson }>(`/lessons/${id}`, { auth: false });
//       setLesson(r.lesson);
//     })();
//   }, [id]);

//   // Fetch similar videos once we know the current lesson's subject/level —
//   // filtered client-side against the same /library/courses list the
//   // Library screen already uses, excluding the lesson currently playing.
//   const loadSimilar = useCallback(async (current: Lesson) => {
//     try {
//       setLoadingSimilar(true);
//       const url = `/library/courses?exam_level=${encodeURIComponent(current.exam_level)}`;
//       const r = await api<{ items: SimilarCourse[] }>(url, { auth: false });
//       const currentId = current.course_id ?? current.id;
//       const ranked = (r.items || [])
//         .filter((c) => c.course_id !== currentId)
//         .sort((a, b) => {
//           // Same subject first, then by views, mirroring a simple
//           // "most relevant, then most popular" ordering.
//           const aMatch = a.subject_name === current.subject_name ? 1 : 0;
//           const bMatch = b.subject_name === current.subject_name ? 1 : 0;
//           if (aMatch !== bMatch) return bMatch - aMatch;
//           return (b.views || 0) - (a.views || 0);
//         });
//       setSimilar(ranked);
//     } catch (error) {
//       console.error("[LessonDetail] Failed to load similar videos:", error);
//       setSimilar([]);
//     } finally {
//       setLoadingSimilar(false);
//     }
//   }, []);

//   useEffect(() => {
//     if (lesson) loadSimilar(lesson);
//   }, [lesson, loadSimilar]);

//   const player = useVideoPlayer(lesson?.video_url ?? null, (p) => {
//     if (lesson?.video_url) {
//       p.loop = false;
//       p.play();
//     }
//   });

//   const openSimilar = useCallback(
//     (item: SimilarCourse) => {
//       // Assumes this screen lives at a route like app/lessons/[id].tsx,
//       // matching the /lessons/:id fetch above. If your related-video
//       // cards should instead point at a /library/[id] route, change the
//       // pathname here to match.
//       router.push(`/lessons/${item.course_id}`);
//     },
//     [router]
//   );

//   if (!lesson) {
//     return (
//       <SafeAreaView edges={["top"]} style={styles.root}>
//         <View style={styles.header}>
//           <Pressable onPress={() => router.back()} testID="back-btn">
//             <Ionicons name="arrow-back" size={22} color={theme.brand} />
//           </Pressable>
//           <Text style={styles.brand}>GCSHARP</Text>
//           <View style={{ width: 22 }} />
//         </View>
//         <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
//           <DetailSkeleton />
//         </ScrollView>
//       </SafeAreaView>
//     );
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

//       {/* Player stays pinned above the scrolling content, YouTube-style —
//           only the info + channel row + description + similar list scroll. */}
//       <VideoView
//         player={player}
//         style={styles.video}
//         allowsFullscreen
//         allowsPictureInPicture
//         contentFit="contain"
//         nativeControls
//       />

//       <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
//         <View style={{ padding: spacing.lg, gap: 6 }}>
//           <View style={{ flexDirection: "row", gap: 6 }}>
//             <View style={styles.pill}><Text style={styles.pillTxt}>{lesson.exam_level}</Text></View>
//             <View style={styles.pill}><Text style={styles.pillTxt}>{lesson.subject_name}</Text></View>
//           </View>

//           <Text style={styles.title}>{lesson.title}</Text>

//           <View style={styles.metaRow}>
//             <Text style={styles.meta}>{formatViews(lesson.views)}</Text>
//             <Text style={styles.metaDot}>•</Text>
//             <Ionicons name="star" size={13} color={theme.warning} />
//             <Text style={styles.meta}>{(lesson.rating ?? 5).toFixed(1)}</Text>
//             <Text style={styles.metaDot}>•</Text>
//             <Ionicons name="time-outline" size={13} color={theme.onSurfaceMuted} />
//             <Text style={styles.meta}>{lesson.duration}</Text>
//           </View>

//           {/* Channel row — avatar + name + a tap target, YouTube's
//               standard layout beneath the title. */}
//           <View style={styles.channelRow}>
//             {lesson.teacher_avatar ? (
//               <Image source={{ uri: lesson.teacher_avatar }} style={styles.avatar} />
//             ) : (
//               <View style={[styles.avatar, styles.avatarFallback]}>
//                 <Text style={styles.avatarInitial}>{(lesson.teacher_name || "T").charAt(0).toUpperCase()}</Text>
//               </View>
//             )}
//             <View style={{ flex: 1 }}>
//               <Text style={styles.teacherName} numberOfLines={1}>{lesson.teacher_name || "GC Teacher"}</Text>
//               <Text style={styles.teacherSub} numberOfLines={1}>{lesson.subject_name} teacher</Text>
//             </View>
//           </View>

//           {/* Expandable description */}
//           {!!lesson.description && (
//             <Pressable onPress={() => setDescExpanded((v) => !v)} style={styles.descBox}>
//               <Text
//                 style={styles.desc}
//                 numberOfLines={descExpanded ? undefined : DESCRIPTION_COLLAPSED_LINES}
//               >
//                 {lesson.description}
//               </Text>
//               <Text style={styles.showMore}>{descExpanded ? "Show less" : "Show more"}</Text>
//             </Pressable>
//           )}
//         </View>

//         <View style={styles.divider} />

//         {/* Similar videos — "Up next" style vertical rail below the
//             player and description, like YouTube's mobile layout. */}
//         <View style={{ paddingTop: spacing.md }}>
//           <Text style={styles.sectionTitle}>Similar videos</Text>

//           {loadingSimilar ? (
//             <>
//               <SimilarRowSkeleton />
//               <SimilarRowSkeleton />
//               <SimilarRowSkeleton />
//             </>
//           ) : similar.length === 0 ? (
//             <Text style={styles.emptySimilar}>No similar videos yet.</Text>
//           ) : (
//             similar.map((item) => (
//               <Pressable
//                 key={item.course_id}
//                 testID={`similar-${item.course_id}`}
//                 style={styles.similarRow}
//                 onPress={() => openSimilar(item)}
//               >
//                 <View style={styles.similarThumbWrap}>
//                   <Image source={{ uri: item.thumbnail }} style={styles.similarThumb} />
//                   <View style={styles.similarDurTag}>
//                     <Text style={styles.similarDurTxt}>{item.duration || "45:00"}</Text>
//                   </View>
//                 </View>
//                 <View style={{ flex: 1, gap: 2 }}>
//                   <Text style={styles.similarTitle} numberOfLines={2}>{item.title}</Text>
//                   <Text style={styles.similarMeta} numberOfLines={1}>{item.teacher_name || "GC Teacher"}</Text>
//                   <Text style={styles.similarMeta}>{formatViews(item.views)} · {item.subject_name}</Text>
//                 </View>
//               </Pressable>
//             ))
//           )}
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
//   skeletonBlock: { backgroundColor: theme.surfaceTertiary },

//   title: { fontSize: 19, fontWeight: "800", color: theme.onSurface, marginTop: 4 },
//   metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
//   meta: { color: theme.onSurfaceMuted, fontSize: 12.5 },
//   metaDot: { color: theme.onSurfaceMuted, fontSize: 12, marginHorizontal: 2 },

//   channelRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
//   avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surfaceTertiary },
//   avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: theme.brandTertiary },
//   avatarInitial: { color: theme.onBrandTertiary, fontWeight: "800", fontSize: 16 },
//   teacherName: { color: theme.onSurface, fontWeight: "700", fontSize: 14 },
//   teacherSub: { color: theme.onSurfaceMuted, fontSize: 12, marginTop: 1 },

//   descBox: { backgroundColor: theme.surfaceTertiary, borderRadius: radii.md, padding: 12, marginTop: 12, gap: 6 },
//   desc: { color: theme.onSurface, lineHeight: 20, fontSize: 13.5 },
//   showMore: { color: theme.brandPrimary, fontWeight: "700", fontSize: 12.5 },

//   divider: { height: 8, backgroundColor: theme.surfaceTertiary, marginTop: spacing.md },

//   sectionTitle: { fontSize: 15, fontWeight: "800", color: theme.onSurface, paddingHorizontal: spacing.lg, marginBottom: 4 },
//   emptySimilar: { color: theme.onSurfaceMuted, fontSize: 13, paddingHorizontal: spacing.lg, paddingVertical: 12 },

//   similarRow: { flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 8 },
//   similarThumbWrap: { position: "relative", ...shadow1 },
//   similarThumb: { width: 150, height: 84, borderRadius: 8, backgroundColor: theme.surfaceTertiary },
//   similarDurTag: {
//     position: "absolute", right: 4, bottom: 4, backgroundColor: "rgba(0,0,0,0.7)",
//     paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4,
//   },
//   similarDurTxt: { color: "#fff", fontSize: 10, fontWeight: "700" },
//   similarTitle: { color: theme.onSurface, fontWeight: "700", fontSize: 13.5, lineHeight: 18 },
//   similarMeta: { color: theme.onSurfaceMuted, fontSize: 12 },

//   pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: theme.brandTertiary },
//   pillTxt: { color: theme.onBrandTertiary, fontSize: 11, fontWeight: "700" },
//   row: { flexDirection: "row", alignItems: "center", gap: 4 },
// });\























import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, Animated, Easing, Alert, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { WebView } from "react-native-webview";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
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
  teacher_id?: string;
  thumbnail?: string;
  duration: string;
  views: number;
  rating: number;
  video_url: string;
  methodology?: { title: string; text: string }[];
  chapters?: { title: string; duration: string }[];
  liked?: boolean;
  saved?: boolean;
  likes?: number;
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

// aspectRatio on <WebView> is unreliable on Android — the native view
// sometimes never gets a real height to lay out against, which is what
// was collapsing the video to a thin black sliver. Computing an explicit
// pixel height from screen width avoids that entirely.
const SCREEN_WIDTH = Dimensions.get("window").width;
const VIDEO_HEIGHT = Math.round((SCREEN_WIDTH * 9) / 16);

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

function isYouTubeUrl(url: string | undefined | null): boolean {
  return !!url && /(?:youtube\.com|youtu\.be)/i.test(url);
}

function getYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

// react-native-webview's source={{ html }} loads the string with no real
// origin, so no Referer header reaches YouTube — which is exactly what
// triggers "Error 153: Video player configuration error" (this is
// YouTube's own error text, not ours; it's a known WKWebView/RN WebView
// issue, not specific to this app). Fixed by:
//   1. Passing a real https baseUrl on the WebView's source (below),
//      so the document has an actual origin to send as a referrer.
//   2. Using youtube-nocookie.com, which is more consistent about
//      accepting embeds without a full first-party context.
//   3. Setting referrer policy on both the document and the iframe.
const YOUTUBE_EMBED_BASE_URL = "https://www.youtube.com";

function getYouTubeEmbedHtml(videoId: string) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
        />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: #000;
            overflow: hidden;
          }
          .video-container {
            position: relative;
            width: 100%;
            height: 100%;
            background: #000;
          }
          iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: 0;
          }
        </style>
      </head>
      <body>
        <div class="video-container">
          <iframe
            src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&controls=1&rel=0&modestbranding=1&playsinline=1&origin=${encodeURIComponent(YOUTUBE_EMBED_BASE_URL)}"
            title="YouTube video player"
            frameborder="0"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowfullscreen
          ></iframe>
        </div>
      </body>
    </html>
  `;
}

export default function CourseDetail() {
  useTheme(); // re-render this screen when light/dark changes
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [similar, setSimilar] = useState<SimilarCourse[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isYouTube, setIsYouTube] = useState(false);
  const [youTubeId, setYouTubeId] = useState<string | null>(null);

  const courseId = course?.course_id ?? course?.id ?? (id as string);

  const player = useVideoPlayer(null, (p) => {
    if (p) {
      p.loop = false;
    }
  });

  // expo-video's own "Video player configuration error" overlay fires when
  // player.replace() gets an empty/malformed source. Subscribing to status
  // lets us catch that and show our own message instead of the native one.
  const { status: playerStatus, error: playerError } = useEvent(player, "statusChange", {
    status: player.status,
  });

  useEffect(() => {
    if (playerStatus === "error") {
      console.error("[CourseDetail] Video player error:", playerError);
    }
  }, [playerStatus, playerError]);

  useEffect(() => {
    setCourse(null);
    setDescExpanded(false);
    setSimilar([]);
    setIsYouTube(false);
    setYouTubeId(null);

    (async () => {
      try {
        const r = await api<{ course: Course }>(`/library/courses/${id}`, { auth: false });
        const c = r.course;

        setCourse(c);
        setLiked(c.liked || false);
        setSaved(c.saved || false);
        setLikesCount(c.likes || 0);

        const yt = isYouTubeUrl(c.video_url);
        setIsYouTube(yt);

        if (yt) {
          setYouTubeId(getYouTubeId(c.video_url));
        } else if (c.video_url) {
          try {
            await player.replaceAsync(c.video_url);
          } catch (e) {
            console.error("[CourseDetail] player.replaceAsync failed:", e);
          }
        }
      } catch (error) {
        console.error("[CourseDetail] Failed to load course:", error);
        Alert.alert("Error", "Could not load course details. Please try again.");
      }
    })();
  }, [id, player]);

  useEffect(() => {
    if (course) loadSimilar(course);
  }, [course]);

  useEffect(() => {
    if (course && !isYouTube && course.video_url && playerStatus !== "error") {
      player.play();
    }
  }, [course, isYouTube, player, playerStatus]);

  const retryPlayback = async () => {
    if (!course?.video_url) return;
    try {
      await player.replaceAsync(course.video_url);
      player.play();
    } catch (e) {
      console.error("[CourseDetail] Retry failed:", e);
    }
  };

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

  const openSimilar = useCallback(
    (item: SimilarCourse) => {
      router.push(`/library/${item.course_id}`);
    },
    [router]
  );

  const toggleLike = async () => {
    if (!courseId) return;
    try {
      const res = await api<{ liked: boolean; likes: number }>(
        `/courses/${courseId}/like`,
        { method: "POST" }
      );
      setLiked(res.liked);
      setLikesCount(res.likes);
    } catch (error) {
      console.error("[CourseDetail] Like error:", error);
      Alert.alert("Error", "Could not update like. Please try again.");
    }
  };

  const toggleSave = async () => {
    if (!courseId) return;
    try {
      const res = await api<{ saved: boolean }>(
        `/courses/${courseId}/save`,
        { method: "POST" }
      );
      setSaved(res.saved);
      Alert.alert(
        res.saved ? "Saved" : "Removed",
        res.saved ? "Video saved to your library." : "Video removed from saved."
      );
    } catch (error) {
      console.error("[CourseDetail] Save error:", error);
      Alert.alert("Error", "Could not save video. Please try again.");
    }
  };

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
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={toggleLike} testID="like-btn">
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={24}
              color={liked ? theme.error : theme.onSurface}
            />
          </Pressable>
          <Pressable onPress={toggleSave} testID="save-btn">
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={24}
              color={saved ? theme.brandPrimary : theme.onSurface}
            />
          </Pressable>
        </View>
      </View>

      {!course.video_url ? (
        <View style={[styles.video, styles.videoErrorBox]}>
          <Ionicons name="videocam-off-outline" size={28} color="#fff" />
          <Text style={styles.videoErrorText}>No video available for this course.</Text>
        </View>
      ) : isYouTube && youTubeId ? (
        <WebView
          style={styles.video}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
          bounces={false}
          setSupportMultipleWindows={false}
          source={{ html: getYouTubeEmbedHtml(youTubeId), baseUrl: YOUTUBE_EMBED_BASE_URL }}
        />
      ) : isYouTube && !youTubeId ? (
        <View style={[styles.video, styles.videoErrorBox]}>
          <Ionicons name="alert-circle-outline" size={28} color="#fff" />
          <Text style={styles.videoErrorText}>Couldn't read this YouTube link.</Text>
        </View>
      ) : playerStatus === "error" ? (
        <View style={[styles.video, styles.videoErrorBox]}>
          <Ionicons name="alert-circle-outline" size={28} color="#fff" />
          <Text style={styles.videoErrorText}>Couldn't load this video. The link may be broken or unsupported.</Text>
          <Pressable onPress={retryPlayback} style={styles.retryBtn} testID="video-retry-btn">
            <Text style={styles.retryBtnTxt}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <VideoView
          player={player}
          style={styles.video}
          fullscreenOptions={{ enable: true }}
          allowsPictureInPicture
          contentFit="contain"
          nativeControls
        />
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ padding: spacing.lg, gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <View style={styles.pill}><Text style={styles.pillTxt}>{course.exam_level}</Text></View>
            <View style={styles.pill}><Text style={styles.pillTxt}>{course.subject_name}</Text></View>
            {likesCount > 0 && (
              <View style={[styles.pill, { backgroundColor: theme.surfaceTertiary }]}>
                <Ionicons name="heart" size={12} color={theme.error} />
                <Text style={[styles.pillTxt, { marginLeft: 4 }]}>{likesCount}</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{course.title}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.meta}>{formatViews(course.views)}</Text>
            <Text style={styles.metaDot}>-</Text>
            <Ionicons name="star" size={13} color={theme.warning} />
            <Text style={styles.meta}>{(course.rating ?? 5).toFixed(1)}</Text>
            <Text style={styles.metaDot}>-</Text>
            <Ionicons name="time-outline" size={13} color={theme.onSurfaceMuted} />
            <Text style={styles.meta}>{course.duration}</Text>
          </View>

          <Pressable
            style={styles.channelRow}
            disabled={!course.teacher_id}
            onPress={() => course.teacher_id && router.push(`/teacher-profile/${course.teacher_id}` as any)}
            testID="teacher-row"
          >
            {course.teacher_avatar ? (
              <Image source={{ uri: course.teacher_avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>
                  {(course.teacher_name || "T").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.teacherName} numberOfLines={1}>
                {course.teacher_name || "GC Teacher"}
              </Text>
              <Text style={styles.teacherSub} numberOfLines={1}>
                {course.subject_name} teacher
              </Text>
            </View>
            {course.teacher_id ? (
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceMuted} />
            ) : null}
          </Pressable>

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
                  <Text style={styles.similarMeta} numberOfLines={1}>
                    {item.teacher_name || "GC Teacher"}
                  </Text>
                  <Text style={styles.similarMeta}>
                    {formatViews(item.views)} - {item.subject_name}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  brand: { fontSize: 16, fontWeight: "800", color: t.brand, letterSpacing: 1 },
  video: { width: "100%", height: VIDEO_HEIGHT, backgroundColor: "#000" },
  videoErrorBox: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  videoErrorText: { color: t.onBrandPrimary, marginTop: 8, fontSize: 13, textAlign: "center" },
  retryBtn: {
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: radii.pill, backgroundColor: t.brandPrimary,
  },
  retryBtnTxt: { color: t.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  skeletonBlock: { backgroundColor: t.surfaceTertiary },

  title: { fontSize: 19, fontWeight: "800", color: t.onSurface, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  meta: { color: t.onSurfaceMuted, fontSize: 12.5 },
  metaDot: { color: t.onSurfaceMuted, fontSize: 12, marginHorizontal: 2 },

  channelRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: t.brandTertiary },
  avatarInitial: { color: t.onBrandTertiary, fontWeight: "800", fontSize: 16 },
  teacherName: { color: t.onSurface, fontWeight: "700", fontSize: 14 },
  teacherSub: { color: t.onSurfaceMuted, fontSize: 12, marginTop: 1 },

  descBox: { backgroundColor: t.surfaceTertiary, borderRadius: radii.md, padding: 12, marginTop: 12, gap: 6 },
  desc: { color: t.onSurface, lineHeight: 20, fontSize: 13.5 },
  showMore: { color: t.brandPrimary, fontWeight: "700", fontSize: 12.5 },

  divider: { height: 8, backgroundColor: t.surfaceTertiary, marginTop: spacing.md },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: t.onSurface, paddingHorizontal: spacing.lg, marginBottom: 4 },
  emptySimilar: { color: t.onSurfaceMuted, fontSize: 13, paddingHorizontal: spacing.lg, paddingVertical: 12 },

  similarRow: { flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  similarThumbWrap: { position: "relative", ...shadow1 },
  similarThumb: { width: 150, height: 84, borderRadius: 8, backgroundColor: t.surfaceTertiary },
  similarDurTag: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  similarDurTxt: { color: t.onBrandPrimary, fontSize: 10, fontWeight: "700" },
  similarTitle: { color: t.onSurface, fontWeight: "700", fontSize: 13.5, lineHeight: 18 },
  similarMeta: { color: t.onSurfaceMuted, fontSize: 12 },

  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: t.brandTertiary },
  pillTxt: { color: t.onBrandTertiary, fontSize: 11, fontWeight: "700" },

  stepCard: {
    flexDirection: "row",
    backgroundColor: t.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radii.md,
    ...shadow1,
    gap: 12,
    alignItems: "flex-start",
    marginTop: 8,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.success,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumTxt: { color: t.onBrandPrimary, fontWeight: "800" },
  stepTitle: { fontWeight: "700", color: t.onSurface, marginBottom: 4 },
  stepText: { color: t.onSurfaceMuted, lineHeight: 20, fontSize: 13 },

  chapter: {
    flexDirection: "row",
    backgroundColor: t.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radii.md,
    ...shadow1,
    gap: 12,
    alignItems: "center",
    marginTop: 8,
  },
  chapNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  chapNumTxt: { color: t.brand, fontWeight: "800" },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});
// import { useEffect, useState, useCallback } from "react";
// import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { useAuth } from "@/src/auth";
// import { api } from "@/src/api";

// type DashboardStats = {
//   study_hours: number;
//   questions_attempted: number;
//   accuracy: number;
//   streak: number;
//   xp: number;
//   level: number;
//   xp_to_next: number;
//   weak_topics: string[];
//   strong_topics: string[];
//   consistency: { day: string; minutes: number }[];
//   total_attempts: number;
// };

// export default function Home() {
//   const { user } = useAuth();
//   const router = useRouter();
//   const [stats, setStats] = useState<DashboardStats | null>(null);
//   const [refreshing, setRefreshing] = useState(false);
//   const [loading, setLoading] = useState(true);

//   const loadStats = useCallback(async () => {
//     try {
//       // Use the correct endpoint from your server
//       const data = await api<DashboardStats>("/dashboard/stats");
//       setStats(data);
//     } catch (error) {
//       console.log("Failed to load dashboard stats:", error);
//       // Set default values if API fails
//       setStats({
//         study_hours: 0,
//         questions_attempted: 0,
//         accuracy: 0,
//         streak: user?.streak || 0,
//         xp: user?.xp || 0,
//         level: user?.level || 1,
//         xp_to_next: 500,
//         weak_topics: [],
//         strong_topics: [],
//         consistency: [
//           { day: "Mon", minutes: 0 },
//           { day: "Tue", minutes: 0 },
//           { day: "Wed", minutes: 0 },
//           { day: "Thu", minutes: 0 },
//           { day: "Fri", minutes: 0 },
//           { day: "Sat", minutes: 0 },
//           { day: "Sun", minutes: 0 },
//         ],
//         total_attempts: 0,
//       });
//     } finally {
//       setLoading(false);
//     }
//   }, [user]);

//   useEffect(() => {
//     loadStats();
//   }, [loadStats]);

//   const onRefresh = async () => {
//     setRefreshing(true);
//     await loadStats();
//     setRefreshing(false);
//   };

//   const initials = (user?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("");

//   if (loading) {
//     return (
//       <SafeAreaView edges={["top"]} style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
//         <Text style={{ color: theme.onSurfaceMuted }}>Loading...</Text>
//       </SafeAreaView>
//     );
//   }

//   const data = stats;

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="home-screen">
//       <ScrollView
//         contentContainerStyle={{ paddingBottom: 24 }}
//         refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brandPrimary} />}
//       >
//         <View style={styles.header}>
//           <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
//             <View style={styles.avatar}>
//               <Text style={styles.avatarTxt}>{initials}</Text>
//             </View>
//             <View>
//               <Text style={styles.greet}>Hello, {user?.full_name?.split(" ")[0] || "Student"}</Text>
//               <Text style={styles.brandTop}>GCSHARP</Text>
//             </View>
//           </View>
//           <Pressable style={styles.bell} testID="notifications-btn">
//             <Ionicons name="notifications-outline" size={22} color={theme.brand} />
//           </Pressable>
//         </View>

//         <View style={styles.statsRow}>
//           <View style={[styles.stat, { backgroundColor: theme.brand }]}>
//             <Ionicons name="flame" size={20} color="#FDBA74" />
//             <Text style={styles.statValue}>{data?.streak ?? 0}</Text>
//             <Text style={styles.statLabel}>Day Streak</Text>
//           </View>
//           <View style={styles.stat}>
//             <Ionicons name="trophy-outline" size={20} color={theme.warning} />
//             <Text style={[styles.statValue, { color: theme.onSurface }]}>{data?.xp ?? 0}</Text>
//             <Text style={[styles.statLabel, { color: theme.onSurfaceMuted }]}>XP Points</Text>
//           </View>
//           <View style={styles.stat}>
//             <Ionicons name="checkmark-circle-outline" size={20} color={theme.success} />
//             <Text style={[styles.statValue, { color: theme.onSurface }]}>{data?.accuracy ?? 0}%</Text>
//             <Text style={[styles.statLabel, { color: theme.onSurfaceMuted }]}>Accuracy</Text>
//           </View>
//         </View>

//         <Text style={styles.sectionTitle}>Quick actions</Text>
//         <View style={styles.actions}>
//           <Action
//             icon="document-text-outline"
//             label="Past Questions"
//             onPress={() => router.push("/past-questions")}
//             testID="action-past-questions"
//           />
//           <Action
//             icon="chatbubble-ellipses-outline"
//             label="AI Tutor"
//             onPress={() => router.push("/(tabs)/ai")}
//             testID="action-ai"
//           />
//           <Action
//             icon="stats-chart-outline"
//             label="Stats"
//             onPress={() => router.push("/stats")}
//             testID="action-stats"
//           />
//           <Action
//             icon="book-outline"
//             label="Library"
//             onPress={() => router.push("/(tabs)/library")}
//             testID="action-library"
//           />
//         </View>

//         <Text style={styles.sectionTitle}>Weekly activity</Text>
//         <View style={styles.card}>
//           <View style={styles.chart}>
//             {(data?.consistency ?? []).map((d) => {
//               const max = Math.max(1, ...((data?.consistency ?? []).map((x) => x.minutes)));
//               const height = Math.max(6, (d.minutes / max) * 120);
//               return (
//                 <View key={d.day} style={styles.barCol}>
//                   <View style={[styles.bar, { height }]} />
//                   <Text style={styles.barLabel}>{d.day}</Text>
//                 </View>
//               );
//             })}
//           </View>
//           <Pressable onPress={() => router.push("/stats")} style={styles.detailsBtn} testID="view-full-stats">
//             <Text style={styles.detailsText}>View full analytics</Text>
//             <Ionicons name="arrow-forward" size={16} color={theme.brandPrimary} />
//           </Pressable>
//         </View>

//         <Text style={styles.sectionTitle}>Continue learning</Text>
//         <View style={styles.card}>
//           <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
//             <View style={styles.miniIcon}>
//               <Ionicons name="calculator-outline" size={22} color={theme.brandPrimary} />
//             </View>
//             <View style={{ flex: 1 }}>
//               <Text style={styles.itemTitle}>Pure Mathematics — Paper 1</Text>
//               <Text style={styles.itemSub}>{data?.questions_attempted ?? 0} questions attempted</Text>
//             </View>
//             <Pressable onPress={() => router.push("/past-questions")} style={styles.resumeBtn} testID="resume-btn">
//               <Text style={styles.resumeTxt}>Resume</Text>
//             </Pressable>
//           </View>
//         </View>
//       </ScrollView>
//     </SafeAreaView>
//   );
// }

// function Action({ icon, label, onPress, testID }: any) {
//   return (
//     <Pressable style={styles.actionItem} onPress={onPress} testID={testID}>
//       <View style={styles.actionIcon}>
//         <Ionicons name={icon} size={22} color={theme.brandPrimary} />
//       </View>
//       <Text style={styles.actionLabel}>{label}</Text>
//     </Pressable>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   header: {
//     flexDirection: "row", justifyContent: "space-between", alignItems: "center",
//     paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
//   },
//   avatar: {
//     width: 40, height: 40, borderRadius: 20, backgroundColor: theme.brandTertiary,
//     alignItems: "center", justifyContent: "center",
//   },
//   avatarTxt: { color: theme.brand, fontWeight: "800" },
//   greet: { color: theme.onSurfaceMuted, fontSize: 12 },
//   brandTop: { color: theme.brand, fontWeight: "800", fontSize: 16, letterSpacing: 1 },
//   bell: {
//     width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff",
//     alignItems: "center", justifyContent: "center", ...shadow1,
//   },
//   statsRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
//   stat: {
//     flex: 1, backgroundColor: "#fff", borderRadius: radii.md, padding: spacing.md, ...shadow1, gap: 4,
//   },
//   statValue: { fontSize: 20, fontWeight: "800", color: "#fff", marginTop: 4 },
//   statLabel: { fontSize: 11, color: "#DBEAFE" },
//   sectionTitle: {
//     fontSize: 16, fontWeight: "800", color: theme.onSurface,
//     paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm,
//   },
//   actions: {
//     flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg,
//   },
//   actionItem: {
//     width: "48%", backgroundColor: "#fff", padding: spacing.lg, borderRadius: radii.md,
//     flexDirection: "row", alignItems: "center", gap: 10, ...shadow1,
//   },
//   actionIcon: {
//     width: 40, height: 40, borderRadius: 10, backgroundColor: theme.brandTertiary,
//     alignItems: "center", justifyContent: "center",
//   },
//   actionLabel: { fontWeight: "700", color: theme.onSurface, flex: 1 },
//   card: {
//     marginHorizontal: spacing.lg, backgroundColor: "#fff", borderRadius: radii.md,
//     padding: spacing.lg, ...shadow1,
//   },
//   chart: {
//     flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
//     height: 140, marginBottom: spacing.md,
//   },
//   barCol: { alignItems: "center", flex: 1 },
//   bar: { width: 20, backgroundColor: theme.brandPrimary, borderRadius: 6 },
//   barLabel: { fontSize: 11, color: theme.onSurfaceMuted, marginTop: 6 },
//   detailsBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end" },
//   detailsText: { color: theme.brandPrimary, fontWeight: "700" },
//   miniIcon: {
//     width: 42, height: 42, borderRadius: 10, backgroundColor: theme.brandTertiary,
//     alignItems: "center", justifyContent: "center",
//   },
//   itemTitle: { fontWeight: "700", color: theme.onSurface },
//   itemSub: { fontSize: 12, color: theme.onSurfaceMuted, marginTop: 2 },
//   resumeBtn: { backgroundColor: theme.brand, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill },
//   resumeTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
// });





























































import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Dimensions,
  FlatList,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import Svg, { Circle } from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type DashboardStats = {
  study_hours: number;
  study_seconds: number;
  questions_attempted: number;
  accuracy: number;
  streak: number;
  xp: number;
  level: number;
  xp_to_next: number;
  weak_topics: string[];
  strong_topics: string[];
  consistency: { day: string; minutes: number }[];
  total_attempts: number;
};

type LeaderboardEntry = {
  rank: number;
  name: string;
  xp: number;
  level: number;
  is_me?: boolean;
};

type Course = {
  course_id: string;
  title: string;
  subject: string;
  level: string;
  teacher_name: string;
  thumbnail?: string;
  video_url: string;
};

// ----- XP Progress Ring -----
function XPRing({ xp, level, toNext }: { xp: number; level: number; toNext: number }) {
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, ((500 - toNext) / 500) * 100);
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={styles.ringContainer}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.surfaceTertiary}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.brandPrimary}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          origin={`${size / 2}, ${size / 2}`}
          rotation="-90"
        />
      </Svg>
      <View style={styles.ringContent}>
        <Text style={styles.ringLevelLabel}>Level</Text>
        <Text style={styles.ringLevel}>{level}</Text>
        <Text style={styles.ringXp}>{xp} XP</Text>
      </View>
    </View>
  );
}

// ----- Custom Bar Chart with value labels -----
function ConsistencyChart({ data }: { data: { day: string; minutes: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.minutes));
  const today = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const todayIndex = today === 0 ? 6 : today - 1; // map Sun to index 6 (last)

  return (
    <View style={styles.chartWrapper}>
      {data.map((item, index) => {
        const height = Math.max(6, (item.minutes / max) * 80);
        const isToday = index === todayIndex;
        return (
          <View key={item.day} style={styles.barColumn}>
            <Text style={styles.barValue}>{item.minutes}</Text>
            <View style={[styles.bar, { height, backgroundColor: isToday ? theme.brandPrimary : theme.brandPrimary + "66" }]} />
            <Text style={styles.barLabel}>{item.day}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ top: LeaderboardEntry[]; my_rank?: LeaderboardEntry } | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, leaderboardRes, coursesRes] = await Promise.all([
        api<DashboardStats>("/dashboard/stats"),
        api<{ top: LeaderboardEntry[]; my_rank?: LeaderboardEntry }>("/leaderboard"),
        api<Course[]>("/courses"),
      ]);
      setStats(statsRes);
      setLeaderboard(leaderboardRes);
      setCourses(coursesRes.slice(0, 4));
    } catch (error) {
      console.log("Dashboard load error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const initials = (user?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("");

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: theme.onSurfaceMuted }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const data = stats;

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brandPrimary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>{initials}</Text>
            </View>
            <View>
              <Text style={styles.greet}>Hello, {user?.full_name?.split(" ")[0] || "Student"}</Text>
              <Text style={styles.brandTop}>GCSHARP</Text>
            </View>
          </View>
          <Pressable style={styles.bell} testID="notifications-btn">
            <Ionicons name="notifications-outline" size={22} color={theme.brand} />
          </Pressable>
        </View>

        {/* Stat Cards */}
        <View style={styles.statsRow}>
          <View style={[styles.stat, { backgroundColor: theme.brand }]}>
            <Ionicons name="flame" size={20} color="#FDBA74" />
            <Text style={styles.statValue}>{data?.streak ?? 0}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="trophy-outline" size={20} color={theme.warning} />
            <Text style={[styles.statValue, { color: theme.onSurface }]}>{data?.xp ?? 0}</Text>
            <Text style={[styles.statLabel, { color: theme.onSurfaceMuted }]}>XP Points</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="checkmark-circle-outline" size={20} color={theme.success} />
            <Text style={[styles.statValue, { color: theme.onSurface }]}>{data?.accuracy ?? 0}%</Text>
            <Text style={[styles.statLabel, { color: theme.onSurfaceMuted }]}>Accuracy</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actions}>
          <Action
            icon="document-text-outline"
            label="Past Questions"
            onPress={() => router.push("/past-questions")}
            testID="action-past-questions"
          />
          <Action
            icon="chatbubble-ellipses-outline"
            label="AI Tutor"
            onPress={() => router.push("/(tabs)/ai")}
            testID="action-ai"
          />
          <Action
            icon="stats-chart-outline"
            label="Stats"
            onPress={() => router.push("/stats")}
            testID="action-stats"
          />
          <Action
            icon="book-outline"
            label="Library"
            onPress={() => router.push("/(tabs)/library")}
            testID="action-library"
          />
        </View>

        {/* Start Practice Button */}
        <Pressable
          style={styles.startPractice}
          onPress={() => router.push("/study")}
          testID="start-practice-btn"
        >
          <Text style={styles.startPracticeText}>Start Practice</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>

        {/* Study Consistency Chart */}
        <Text style={styles.sectionTitle}>Study Consistency</Text>
        <View style={styles.card}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartSubtitle}>Minutes studied · last 7 days</Text>
            <View style={styles.trendBadge}>
              <Ionicons name="trending-up" size={14} color={theme.success} />
              <Text style={styles.trendText}>Keep it up</Text>
            </View>
          </View>
          {data?.consistency && data.consistency.length > 0 ? (
            <ConsistencyChart data={data.consistency} />
          ) : (
            <Text style={styles.emptyChart}>No data yet</Text>
          )}
          <Pressable onPress={() => router.push("/stats")} style={styles.detailsBtn}>
            <Text style={styles.detailsText}>View full analytics</Text>
            <Ionicons name="arrow-forward" size={14} color={theme.brandPrimary} />
          </Pressable>
        </View>

        {/* AI Recommendations */}
        <Text style={styles.sectionTitle}>AI Recommendations</Text>
        <View style={[styles.card, styles.aiCard]}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={20} color={theme.brandPrimary} />
            <Text style={styles.aiTitle}>GC AI Suggestions</Text>
          </View>
          {data?.weak_topics && data.weak_topics.length > 0 ? (
            <>
              <Text style={styles.aiSub}>Focus on these weak topics:</Text>
              <View style={styles.topicTags}>
                {data.weak_topics.slice(0, 3).map((t) => (
                  <View key={t} style={styles.weakTag}>
                    <Text style={styles.weakTagText}>{t}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.aiSub}>Complete a practice test and GC AI will pinpoint your weak topics.</Text>
          )}
          <View style={styles.aiButtons}>
            <Pressable style={styles.aiBtn} onPress={() => router.push("/(tabs)/ai")}>
              <Ionicons name="chatbubble-ellipses" size={16} color={theme.brandPrimary} />
              <Text style={styles.aiBtnText}>Ask AI Tutor</Text>
            </Pressable>
            <Pressable style={styles.aiBtn} onPress={() => router.push("/study")}>
              <Ionicons name="compass-outline" size={16} color={theme.brandPrimary} />
              <Text style={styles.aiBtnText}>Practice weak topics</Text>
            </Pressable>
          </View>
        </View>

        {/* XP Progress Ring */}
        <View style={styles.ringRow}>
          <View style={[styles.card, styles.ringCard]}>
            <Text style={styles.ringTitle}>Level Progress</Text>
            {data && (
              <XPRing xp={data.xp} level={data.level} toNext={data.xp_to_next} />
            )}
            <Text style={styles.ringSub}>{data?.xp_to_next ?? 0} XP to next level</Text>
          </View>
        </View>

        {/* Lesson Videos */}
        <Text style={styles.sectionTitle}>Lesson Videos for You</Text>
        {courses.length > 0 ? (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={courses}
            keyExtractor={(item) => item.course_id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => (
              <Pressable
                style={styles.courseCard}
                onPress={() => router.push(`/video/${item.course_id}`)}
              >
                <View style={styles.courseThumb}>
                  {item.thumbnail ? (
                    <Image source={{ uri: item.thumbnail }} style={styles.courseThumbImage} />
                  ) : (
                    <View style={styles.courseThumbPlaceholder}>
                      <Ionicons name="play-circle" size={32} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={styles.courseSubject}>{item.subject}</Text>
                <Text style={styles.courseTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.courseTeacher}>{item.teacher_name}</Text>
              </Pressable>
            )}
          />
        ) : (
          <Text style={styles.emptyText}>No lessons yet. Check back soon.</Text>
        )}

        {/* Leaderboard Preview */}
        <Text style={styles.sectionTitle}>Leaderboard</Text>
        <View style={styles.card}>
          {leaderboard?.my_rank && (
            <View style={styles.leaderboardHeader}>
              <Text style={styles.leaderboardRank}>Your rank: #{leaderboard.my_rank.rank}</Text>
            </View>
          )}
          {(leaderboard?.top || []).slice(0, 5).map((entry) => (
            <View key={entry.rank} style={[styles.leaderboardRow, entry.is_me && styles.leaderboardMe]}>
              <Text style={[styles.leaderboardRankNum, entry.rank <= 3 && styles.leaderboardTopRank]}>
                {entry.rank}
              </Text>
              <Text style={styles.leaderboardName} numberOfLines={1}>
                {entry.name}
                {entry.is_me && <Text style={styles.leaderboardYou}> (You)</Text>}
              </Text>
              <Text style={styles.leaderboardLevel}>Lvl {entry.level}</Text>
              <Text style={styles.leaderboardXp}>{entry.xp} XP</Text>
            </View>
          ))}
          {(!leaderboard?.top || leaderboard.top.length === 0) && (
            <Text style={styles.emptyText}>Be the first on the leaderboard — start practicing!</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ----- Action Component -----
function Action({ icon, label, onPress, testID }: any) {
  return (
    <Pressable style={styles.actionItem} onPress={onPress} testID={testID}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={22} color={theme.brandPrimary} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

// ----- Styles -----
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { color: theme.brand, fontWeight: "800" },
  greet: { color: theme.onSurfaceMuted, fontSize: 12 },
  brandTop: { color: theme.brand, fontWeight: "800", fontSize: 16, letterSpacing: 1 },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    ...shadow1,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: spacing.md,
    ...shadow1,
    gap: 4,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: "#fff", marginTop: 4 },
  statLabel: { fontSize: 11, color: "#DBEAFE" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.onSurface,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  actionItem: {
    width: "48%",
    backgroundColor: "#fff",
    padding: spacing.lg,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...shadow1,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontWeight: "700", color: theme.onSurface, flex: 1 },
  startPractice: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: theme.brand,
    paddingVertical: 14,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...shadow1,
  },
  startPracticeText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: spacing.md,
    ...shadow1,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  chartSubtitle: { fontSize: 12, color: theme.onSurfaceMuted },
  trendBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  trendText: { fontSize: 12, color: theme.success, fontWeight: "600" },
  chartWrapper: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 110,
    marginVertical: spacing.sm,
    gap: 4,
  },
  barColumn: { alignItems: "center", flex: 1 },
  bar: { width: 16, borderRadius: 4 },
  barLabel: { fontSize: 10, color: theme.onSurfaceMuted, marginTop: 4 },
  barValue: { fontSize: 10, color: theme.onSurfaceMuted, marginBottom: 2, fontWeight: "600" },
  emptyChart: { color: theme.onSurfaceMuted, textAlign: "center", padding: spacing.md },
  detailsBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", marginTop: 6 },
  detailsText: { color: theme.brandPrimary, fontWeight: "700", fontSize: 13 },
  aiCard: { gap: spacing.sm },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiTitle: { fontWeight: "700", fontSize: 15, color: theme.onSurface },
  aiSub: { fontSize: 13, color: theme.onSurfaceMuted },
  topicTags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  weakTag: { backgroundColor: "#FEE2E2", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  weakTagText: { color: "#991B1B", fontSize: 12, fontWeight: "600" },
  aiButtons: { flexDirection: "row", gap: 8, marginTop: 4 },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: "#fff",
  },
  aiBtnText: { fontSize: 13, color: theme.brandPrimary, fontWeight: "600" },
  ringRow: { paddingHorizontal: spacing.lg },
  ringCard: { alignItems: "center", paddingVertical: spacing.lg },
  ringTitle: { fontWeight: "700", fontSize: 15, color: theme.onSurface, marginBottom: spacing.sm },
  ringContainer: { position: "relative", alignItems: "center", justifyContent: "center" },
  ringContent: { position: "absolute", alignItems: "center" },
  ringLevelLabel: { fontSize: 10, color: theme.onSurfaceMuted },
  ringLevel: { fontSize: 28, fontWeight: "800", color: theme.brand, marginTop: -2 },
  ringXp: { fontSize: 11, color: theme.onSurfaceMuted },
  ringSub: { fontSize: 13, color: theme.onSurfaceMuted, marginTop: 6 },
  courseCard: {
    width: 140,
    backgroundColor: "#fff",
    borderRadius: radii.md,
    overflow: "hidden",
    ...shadow1,
    marginRight: spacing.sm,
  },
  courseThumb: { height: 80, backgroundColor: theme.surfaceTertiary },
  courseThumbImage: { width: "100%", height: "100%", resizeMode: "cover" },
  courseThumbPlaceholder: {
    flex: 1,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  courseSubject: { fontSize: 10, color: theme.brandPrimary, paddingHorizontal: 8, paddingTop: 6, fontWeight: "600" },
  courseTitle: { fontSize: 13, fontWeight: "600", color: theme.onSurface, paddingHorizontal: 8 },
  courseTeacher: { fontSize: 11, color: theme.onSurfaceMuted, paddingHorizontal: 8, paddingBottom: 8 },
  emptyText: { color: theme.onSurfaceMuted, textAlign: "center", padding: spacing.md },
  leaderboardHeader: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 },
  leaderboardRank: { fontSize: 13, color: theme.onSurfaceMuted },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
    gap: 8,
  },
  leaderboardMe: { backgroundColor: theme.brandTertiary, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: radii.sm },
  leaderboardRankNum: { width: 24, fontSize: 14, fontWeight: "700", color: theme.onSurfaceMuted, textAlign: "center" },
  leaderboardTopRank: { color: theme.warning },
  leaderboardName: { flex: 1, fontSize: 14, color: theme.onSurface },
  leaderboardYou: { fontSize: 11, color: theme.brandPrimary, fontWeight: "600" },
  leaderboardLevel: { fontSize: 12, color: theme.onSurfaceMuted },
  leaderboardXp: { fontSize: 13, fontWeight: "700", color: theme.brand },
});
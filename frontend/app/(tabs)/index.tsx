// import { useEffect, useState, useCallback } from "react";
// import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { useAuth } from "@/src/auth";
// import { api } from "@/src/api";

// type Analytics = {
//   study_hours: number;
//   accuracy_rate: number;
//   papers_completed: number;
//   target_papers: number;
//   questions_attempted: number;
//   xp: number;
//   streak: number;
//   weekly: { day: string; minutes: number; attempted: number }[];
// };

// export default function Home() {
//   const { user } = useAuth();
//   const router = useRouter();
//   const [a, setA] = useState<Analytics | null>(null);
//   const [refreshing, setRefreshing] = useState(false);

//   const load = useCallback(async () => {
//     try {
//       const r = await api<Analytics>("/analytics/student");
//       setA(r);
//     } catch { }
//   }, []);
//   useEffect(() => { load(); }, [load]);

//   const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

//   const initials = (user?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("");

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="home-screen">
//       <ScrollView
//         contentContainerStyle={{ paddingBottom: 24 }}
//         refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brandPrimary} />}
//       >
//         <View style={styles.header}>
//           <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
//             <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials}</Text></View>
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
//             <Text style={styles.statValue}>{a?.streak ?? 0}</Text>
//             <Text style={styles.statLabel}>Day Streak</Text>
//           </View>
//           <View style={styles.stat}>
//             <Ionicons name="trophy-outline" size={20} color={theme.warning} />
//             <Text style={[styles.statValue, { color: theme.onSurface }]}>{a?.xp ?? 0}</Text>
//             <Text style={[styles.statLabel, { color: theme.onSurfaceMuted }]}>XP Points</Text>
//           </View>
//           <View style={styles.stat}>
//             <Ionicons name="checkmark-circle-outline" size={20} color={theme.success} />
//             <Text style={[styles.statValue, { color: theme.onSurface }]}>{a?.accuracy_rate ?? 0}%</Text>
//             <Text style={[styles.statLabel, { color: theme.onSurfaceMuted }]}>Accuracy</Text>
//           </View>
//         </View>

//         <Text style={styles.sectionTitle}>Quick actions</Text>
//         <View style={styles.actions}>
//           <Action icon="document-text-outline" label="Past Questions" onPress={() => router.push("/past-questions")} testID="action-past-questions" />
//           <Action icon="chatbubble-ellipses-outline" label="AI Tutor" onPress={() => router.push("/(tabs)/ai")} testID="action-ai" />
//           <Action icon="stats-chart-outline" label="Stats" onPress={() => router.push("/stats")} testID="action-stats" />
//           <Action icon="book-outline" label="Library" onPress={() => router.push("/(tabs)/library")} testID="action-library" />
//         </View>

//         <Text style={styles.sectionTitle}>Weekly activity</Text>
//         <View style={styles.card}>
//           <View style={styles.chart}>
//             {(a?.weekly ?? []).map((d) => {
//               const max = Math.max(1, ...(a?.weekly ?? []).map((x) => x.minutes));
//               const h = Math.max(6, (d.minutes / max) * 120);
//               return (
//                 <View key={d.day} style={styles.barCol}>
//                   <View style={[styles.bar, { height: h }]} />
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
//             <View style={styles.miniIcon}><Ionicons name="calculator-outline" size={22} color={theme.brandPrimary} /></View>
//             <View style={{ flex: 1 }}>
//               <Text style={styles.itemTitle}>Pure Mathematics — Paper 1</Text>
//               <Text style={styles.itemSub}>{a?.questions_attempted ?? 0} questions attempted</Text>
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
//       <View style={styles.actionIcon}><Ionicons name={icon} size={22} color={theme.brandPrimary} /></View>
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
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

type DashboardStats = {
  study_hours: number;
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

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      // Use the correct endpoint from your server
      const data = await api<DashboardStats>("/dashboard/stats");
      setStats(data);
    } catch (error) {
      console.log("Failed to load dashboard stats:", error);
      // Set default values if API fails
      setStats({
        study_hours: 0,
        questions_attempted: 0,
        accuracy: 0,
        streak: user?.streak || 0,
        xp: user?.xp || 0,
        level: user?.level || 1,
        xp_to_next: 500,
        weak_topics: [],
        strong_topics: [],
        consistency: [
          { day: "Mon", minutes: 0 },
          { day: "Tue", minutes: 0 },
          { day: "Wed", minutes: 0 },
          { day: "Thu", minutes: 0 },
          { day: "Fri", minutes: 0 },
          { day: "Sat", minutes: 0 },
          { day: "Sun", minutes: 0 },
        ],
        total_attempts: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const initials = (user?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("");

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
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
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
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

        <Text style={styles.sectionTitle}>Weekly activity</Text>
        <View style={styles.card}>
          <View style={styles.chart}>
            {(data?.consistency ?? []).map((d) => {
              const max = Math.max(1, ...((data?.consistency ?? []).map((x) => x.minutes)));
              const height = Math.max(6, (d.minutes / max) * 120);
              return (
                <View key={d.day} style={styles.barCol}>
                  <View style={[styles.bar, { height }]} />
                  <Text style={styles.barLabel}>{d.day}</Text>
                </View>
              );
            })}
          </View>
          <Pressable onPress={() => router.push("/stats")} style={styles.detailsBtn} testID="view-full-stats">
            <Text style={styles.detailsText}>View full analytics</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.brandPrimary} />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Continue learning</Text>
        <View style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.miniIcon}>
              <Ionicons name="calculator-outline" size={22} color={theme.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Pure Mathematics — Paper 1</Text>
              <Text style={styles.itemSub}>{data?.questions_attempted ?? 0} questions attempted</Text>
            </View>
            <Pressable onPress={() => router.push("/past-questions")} style={styles.resumeBtn} testID="resume-btn">
              <Text style={styles.resumeTxt}>Resume</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  avatarTxt: { color: theme.brand, fontWeight: "800" },
  greet: { color: theme.onSurfaceMuted, fontSize: 12 },
  brandTop: { color: theme.brand, fontWeight: "800", fontSize: 16, letterSpacing: 1 },
  bell: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", ...shadow1,
  },
  statsRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  stat: {
    flex: 1, backgroundColor: "#fff", borderRadius: radii.md, padding: spacing.md, ...shadow1, gap: 4,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: "#fff", marginTop: 4 },
  statLabel: { fontSize: 11, color: "#DBEAFE" },
  sectionTitle: {
    fontSize: 16, fontWeight: "800", color: theme.onSurface,
    paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg,
  },
  actionItem: {
    width: "48%", backgroundColor: "#fff", padding: spacing.lg, borderRadius: radii.md,
    flexDirection: "row", alignItems: "center", gap: 10, ...shadow1,
  },
  actionIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: theme.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  actionLabel: { fontWeight: "700", color: theme.onSurface, flex: 1 },
  card: {
    marginHorizontal: spacing.lg, backgroundColor: "#fff", borderRadius: radii.md,
    padding: spacing.lg, ...shadow1,
  },
  chart: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    height: 140, marginBottom: spacing.md,
  },
  barCol: { alignItems: "center", flex: 1 },
  bar: { width: 20, backgroundColor: theme.brandPrimary, borderRadius: 6 },
  barLabel: { fontSize: 11, color: theme.onSurfaceMuted, marginTop: 6 },
  detailsBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end" },
  detailsText: { color: theme.brandPrimary, fontWeight: "700" },
  miniIcon: {
    width: 42, height: 42, borderRadius: 10, backgroundColor: theme.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  itemTitle: { fontWeight: "700", color: theme.onSurface },
  itemSub: { fontSize: 12, color: theme.onSurfaceMuted, marginTop: 2 },
  resumeBtn: { backgroundColor: theme.brand, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill },
  resumeTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
// import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter } from "expo-router";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
// import { useAuth } from "@/src/auth";

// export default function Profile() {
//   const { user, logout } = useAuth();
//   const router = useRouter();
//   const initials = (user?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("");

//   const doLogout = async () => {
//     await logout();
//     router.replace("/welcome");
//   };

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="profile-screen">
//       <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 32 }}>
//         <View style={styles.head}>
//           <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials}</Text></View>
//           <Text style={styles.name}>{user?.full_name}</Text>
//           <Text style={styles.email}>{user?.email}</Text>
//           <View style={styles.pill}><Text style={styles.pillTxt}>{user?.exam_level ?? "GCE A Level"}</Text></View>
//         </View>

//         <View style={styles.metricsRow}>
//           <Metric icon="flame" label="Streak" value={String(user?.streak ?? 0)} tint={theme.warning} />
//           <Metric icon="trophy-outline" label="Level" value={String(user?.level ?? 1)} tint={theme.brandPrimary} />
//           <Metric icon="star" label="XP" value={String(user?.xp ?? 0)} tint={theme.success} />
//         </View>

//         <Row icon="stats-chart-outline" label="Academic Analytics" onPress={() => router.push("/stats")} testID="row-stats" />
//         <Row icon="bookmark-outline" label="My Drafts" onPress={() => router.push("/drafts")} testID="row-drafts" />
//         <Row icon="document-text-outline" label="Past Questions" onPress={() => router.push("/past-questions")} testID="row-pastq" />
//         <Row icon="chatbubble-ellipses-outline" label="AI Tutor" onPress={() => router.push("/(tabs)/ai")} testID="row-ai" />
//         <Row icon="videocam-outline" label="Lesson Videos" onPress={() => router.push("/(tabs)/lessons")} testID="row-lessons" />
//         <Row icon="book-outline" label="Library" onPress={() => router.push("/(tabs)/library")} testID="row-library" />
//         <Row icon="log-out-outline" label="Log out" danger onPress={doLogout} testID="row-logout" />
//       </ScrollView>
//     </SafeAreaView>
//   );
// }

// function Metric({ icon, label, value, tint }: any) {
//   return (
//     <View style={styles.metric}>
//       <Ionicons name={icon} size={20} color={tint} />
//       <Text style={styles.metricVal}>{value}</Text>
//       <Text style={styles.metricLabel}>{label}</Text>
//     </View>
//   );
// }

// function Row({ icon, label, onPress, danger, testID }: any) {
//   return (
//     <Pressable style={styles.row} onPress={onPress} testID={testID}>
//       <Ionicons name={icon} size={20} color={danger ? theme.error : theme.brand} />
//       <Text style={[styles.rowTxt, danger && { color: theme.error }]}>{label}</Text>
//       <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceMuted} />
//     </Pressable>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: theme.surface },
//   head: { alignItems: "center", padding: spacing.lg, gap: 6 },
//   avatar: {
//     width: 84, height: 84, borderRadius: 42, backgroundColor: theme.brand,
//     alignItems: "center", justifyContent: "center",
//   },
//   avatarTxt: { color: "#fff", fontSize: 32, fontWeight: "800" },
//   name: { fontSize: 20, fontWeight: "800", color: theme.onSurface, marginTop: 4 },
//   email: { color: theme.onSurfaceMuted },
//   pill: {
//     marginTop: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radii.pill,
//     backgroundColor: theme.brandTertiary,
//   },
//   pillTxt: { color: theme.onBrandTertiary, fontWeight: "700", fontSize: 12 },
//   metricsRow: { flexDirection: "row", gap: spacing.sm },
//   metric: {
//     flex: 1, backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md, alignItems: "center", ...shadow1,
//   },
//   metricVal: { fontSize: 20, fontWeight: "800", color: theme.onSurface, marginTop: 4 },
//   metricLabel: { color: theme.onSurfaceMuted, fontSize: 12 },
//   row: {
//     flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff",
//     padding: spacing.lg, borderRadius: radii.md, ...shadow1,
//   },
//   rowTxt: { flex: 1, fontWeight: "600", color: theme.onSurface, fontSize: 15 },
// });
























// app/(tabs)/profile.tsx
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function Profile() {   // <-- must be Profile, not EditProfile
  const { user, logout } = useAuth();
  const router = useRouter();
  const initials = (user?.full_name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("");

  const doLogout = async () => {
    await logout();
    router.replace("/welcome");
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="profile-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 32 }}>
        <View style={styles.head}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials}</Text></View>
          <Text style={styles.name}>{user?.full_name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.pill}><Text style={styles.pillTxt}>{user?.exam_level ?? "GCE A Level"}</Text></View>
        </View>

        <View style={styles.metricsRow}>
          <Metric icon="flame" label="Streak" value={String(user?.streak ?? 0)} tint={theme.warning} />
          <Metric icon="trophy-outline" label="Level" value={String(user?.level ?? 1)} tint={theme.brandPrimary} />
          <Metric icon="star" label="XP" value={String(user?.xp ?? 0)} tint={theme.success} />
        </View>

        <Row icon="create-outline" label="Edit Profile" onPress={() => router.push("/edit-profile")} testID="row-edit" />
        <Row icon="stats-chart-outline" label="Academic Analytics" onPress={() => router.push("/stats")} testID="row-stats" />
        <Row icon="bookmark-outline" label="My Drafts" onPress={() => router.push("/drafts")} testID="row-drafts" />
        <Row icon="document-text-outline" label="Past Questions" onPress={() => router.push("/past-questions")} testID="row-pastq" />
        <Row icon="chatbubble-ellipses-outline" label="AI Tutor" onPress={() => router.push("/(tabs)/ai")} testID="row-ai" />
        <Row icon="videocam-outline" label="Lesson Videos" onPress={() => router.push("/(tabs)/lessons")} testID="row-lessons" />
        <Row icon="book-outline" label="Library" onPress={() => router.push("/(tabs)/library")} testID="row-library" />
        <Row icon="log-out-outline" label="Log out" danger onPress={doLogout} testID="row-logout" />
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ icon, label, value, tint }: any) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={styles.metricVal}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, onPress, danger, testID }: any) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={20} color={danger ? theme.error : theme.brand} />
      <Text style={[styles.rowTxt, danger && { color: theme.error }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  head: { alignItems: "center", padding: spacing.lg, gap: 6 },
  avatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: theme.brand,
    alignItems: "center", justifyContent: "center",
  },
  avatarTxt: { color: "#fff", fontSize: 32, fontWeight: "800" },
  name: { fontSize: 20, fontWeight: "800", color: theme.onSurface, marginTop: 4 },
  email: { color: theme.onSurfaceMuted },
  pill: {
    marginTop: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radii.pill,
    backgroundColor: theme.brandTertiary,
  },
  pillTxt: { color: theme.onBrandTertiary, fontWeight: "700", fontSize: 12 },
  metricsRow: { flexDirection: "row", gap: spacing.sm },
  metric: {
    flex: 1, backgroundColor: "#fff", padding: spacing.md, borderRadius: radii.md, alignItems: "center", ...shadow1,
  },
  metricVal: { fontSize: 20, fontWeight: "800", color: theme.onSurface, marginTop: 4 },
  metricLabel: { color: theme.onSurfaceMuted, fontSize: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff",
    padding: spacing.lg, borderRadius: radii.md, ...shadow1,
  },
  rowTxt: { flex: 1, fontWeight: "600", color: theme.onSurface, fontSize: 15 },
});
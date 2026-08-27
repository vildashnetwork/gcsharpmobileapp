import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function TeacherDashboard() {
  useTheme(); // re-render this screen when light/dark changes
  const { user, logout } = useAuth();
  const router = useRouter();
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<any>("/teacher/overview");
        setD(r);
      } catch {}
    })();
  }, []);

  const doLogout = async () => { await logout(); router.replace("/welcome"); };

  if (!d) return <SafeAreaView style={styles.root}><ActivityIndicator style={{ marginTop: 60 }} color={theme.brandPrimary} /></SafeAreaView>;

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="teacher-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.greet}>Welcome</Text>
          <Text style={styles.name}>{user?.full_name}</Text>
        </View>
        <Pressable style={styles.logout} onPress={doLogout} testID="logout-btn">
          <Ionicons name="log-out-outline" size={20} color={theme.error} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
        <View style={[styles.earn, { backgroundColor: theme.brand }]}>
          <Text style={styles.earnLbl}>Estimated Earnings</Text>
          <Text style={styles.earnAmt}>{d.earnings_fcfa.toLocaleString()} FCFA</Text>
          <Text style={styles.earnMeta}>{d.monthly_views.toLocaleString()} qualified views × {d.rate_per_view} FCFA</Text>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={styles.stat}>
            <Ionicons name="people-outline" size={20} color={theme.brandPrimary} />
            <Text style={styles.statV}>{d.students}</Text>
            <Text style={styles.statL}>Students</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="videocam-outline" size={20} color={theme.brandPrimary} />
            <Text style={styles.statV}>{d.courses.length}</Text>
            <Text style={styles.statL}>Courses</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="eye-outline" size={20} color={theme.brandPrimary} />
            <Text style={styles.statV}>{d.monthly_views}</Text>
            <Text style={styles.statL}>Views</Text>
          </View>
        </View>

        <Text style={styles.section}>Your courses</Text>
        {d.courses.map((c: any) => (
          <View key={c.course_id} style={styles.course}>
            <View style={styles.courseIcon}><Ionicons name="videocam" size={22} color={theme.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.courseT}>{c.title}</Text>
              <Text style={styles.courseM}>{c.subject_name} · {c.views} views · ⭐ {c.rating}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg },
  greet: { color: t.onSurfaceMuted, fontSize: 12 },
  name: { fontSize: 18, fontWeight: "800", color: t.brand },
  logout: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.surfaceSecondary, alignItems: "center", justifyContent: "center", ...shadow1 },
  earn: { padding: spacing.lg, borderRadius: radii.md, gap: 4 },
  earnLbl: { color: "#DBEAFE", fontSize: 13 },
  earnAmt: { color: t.onBrandPrimary, fontSize: 30, fontWeight: "800" },
  earnMeta: { color: "#DBEAFE", fontSize: 12 },
  stat: { flex: 1, backgroundColor: t.surfaceSecondary, padding: spacing.md, borderRadius: radii.md, ...shadow1, gap: 4, alignItems: "flex-start" },
  statV: { fontSize: 20, fontWeight: "800", color: t.onSurface },
  statL: { color: t.onSurfaceMuted, fontSize: 12 },
  section: { fontSize: 16, fontWeight: "800", color: t.onSurface, marginTop: spacing.md },
  course: { flexDirection: "row", gap: 12, backgroundColor: t.surfaceSecondary, padding: spacing.md, borderRadius: radii.md, ...shadow1, alignItems: "center" },
  courseIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: t.brandTertiary, alignItems: "center", justifyContent: "center" },
  courseT: { fontWeight: "700", color: t.onSurface },
  courseM: { color: t.onSurfaceMuted, fontSize: 12, marginTop: 2 },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});

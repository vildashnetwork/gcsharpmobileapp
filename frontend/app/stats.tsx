import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { api } from "@/src/api";

export default function Stats() {
  const router = useRouter();
  const [a, setA] = useState<any>(null);
  const [range, setRange] = useState<"Daily" | "Weekly">("Daily");

  useEffect(() => {
    (async () => {
      const r = await api<any>("/analytics/student");
      setA(r);
    })();
  }, []);

  if (!a) return <SafeAreaView style={styles.root}><ActivityIndicator style={{ marginTop: 60 }} color={theme.brandPrimary} /></SafeAreaView>;

  const max = Math.max(1, ...a.weekly.map((x: any) => x.minutes));
  const target = a.target_papers || 20;
  const pct = Math.min(100, (a.papers_completed / target) * 100);

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="stats-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
        <Text style={styles.brand}>GCSMART</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
        <View>
          <Text style={styles.h1}>Academic Analytics</Text>
          <Text style={styles.sub}>Track your progress and optimize your study routine.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Study Time</Text>
            <Ionicons name="time-outline" size={20} color={theme.brand} />
          </View>
          <Text style={[styles.big, { color: theme.brand }]}>{a.study_hours}</Text>
          <Text style={styles.metaMuted}>Hours</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Accuracy Rate</Text>
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.success} />
          </View>
          <Text style={[styles.big, { color: theme.success }]}>{a.accuracy_rate}</Text>
          <Text style={styles.metaMuted}>Percentage (%)</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Papers Completed</Text>
            <Ionicons name="document-text-outline" size={20} color={theme.error} />
          </View>
          <Text style={[styles.big, { color: theme.onSurface }]}>{a.papers_completed}</Text>
          <Text style={styles.metaMuted}>Target: {target} per month</Text>
          <View style={styles.progressBg}><View style={[styles.progressFg, { width: `${pct}%` }]} /></View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Weekly Activity</Text>
            <View style={styles.toggle}>
              {(["Daily", "Weekly"] as const).map((r) => (
                <Pressable key={r} onPress={() => setRange(r)} style={[styles.togItem, range === r && styles.togActive]} testID={`range-${r}`}>
                  <Text style={[styles.togTxt, range === r && styles.togTxtActive]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.chart}>
            {a.weekly.map((d: any) => {
              const h = Math.max(8, (d.minutes / max) * 140);
              return (
                <View key={d.day} style={styles.barCol}>
                  <Text style={styles.barVal}>{d.minutes}m</Text>
                  <View style={[styles.bar, { height: h }]} />
                  <Text style={styles.barLabel}>{d.day}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  brand: { fontSize: 16, fontWeight: "800", color: theme.brand, letterSpacing: 1 },
  h1: { fontSize: 24, fontWeight: "800", color: theme.onSurface },
  sub: { color: theme.onSurfaceMuted, marginTop: 2 },
  card: { backgroundColor: "#fff", padding: spacing.lg, borderRadius: radii.md, ...shadow1, gap: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontWeight: "700", color: theme.onSurface },
  big: { fontSize: 40, fontWeight: "800", marginTop: 6 },
  metaMuted: { color: theme.onSurfaceMuted, fontSize: 13 },
  progressBg: { height: 8, backgroundColor: theme.surfaceTertiary, borderRadius: 4, marginTop: 8 },
  progressFg: { height: 8, backgroundColor: theme.brand, borderRadius: 4 },
  toggle: { flexDirection: "row", backgroundColor: theme.surfaceTertiary, borderRadius: radii.pill, padding: 3 },
  togItem: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  togActive: { backgroundColor: theme.brandTertiary },
  togTxt: { color: theme.onSurfaceMuted, fontSize: 12, fontWeight: "600" },
  togTxtActive: { color: theme.brand, fontWeight: "800" },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 170, marginTop: 8 },
  barCol: { alignItems: "center", flex: 1, justifyContent: "flex-end" },
  bar: { width: 20, backgroundColor: theme.brandPrimary, borderRadius: 6 },
  barVal: { fontSize: 10, color: theme.onSurfaceMuted, marginBottom: 4 },
  barLabel: { fontSize: 11, color: theme.onSurfaceMuted, marginTop: 6 },
});

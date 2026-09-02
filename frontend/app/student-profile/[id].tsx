import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { api } from "@/src/api";

 type StudentProfile = {
  user_id: string;
  full_name: string;
  bio?: string;
  institution?: string;
  exam_level?: string;
  profile_photo?: string | null;
  xp: number;
  level: number;
  streak: number;
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

export default function StudentProfile() {
  useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    api<StudentProfile>(`/students/${encodeURIComponent(id)}/profile`)
      .then(setProfile)
      .catch((requestError) => {
        console.error("Failed to load student profile:", requestError);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="student-profile-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={theme.brand} />
        </Pressable>
        <Text style={styles.headerTitle}>Student Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.brandPrimary} />
        </View>
      ) : error || !profile ? (
        <View style={styles.centerState}>
          <Ionicons name="person-remove-outline" size={42} color={theme.onSurfaceMuted} />
          <Text style={styles.stateText}>Student profile unavailable</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileHero}>
            {profile.profile_photo ? (
              <Image source={{ uri: profile.profile_photo }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{getInitials(profile.full_name)}</Text>
              </View>
            )}
            <Text style={styles.name}>{profile.full_name}</Text>
            {!!profile.exam_level && <Text style={styles.level}>{profile.exam_level}</Text>}
            {!!profile.institution && (
              <View style={styles.detailLine}>
                <Ionicons name="school-outline" size={16} color={theme.onSurfaceMuted} />
                <Text style={styles.detailText}>{profile.institution}</Text>
              </View>
            )}
          </View>

          <View style={styles.statsRow}>
            <Stat icon="trophy-outline" label="Level" value={String(profile.level)} />
            <Stat icon="star-outline" label="XP" value={String(profile.xp)} />
            <Stat icon="flame-outline" label="Streak" value={String(profile.streak)} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bio}>{profile.bio?.trim() || "This student has not added a bio yet."}</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={20} color={theme.brandPrimary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: t.divider,
    backgroundColor: t.surfaceSecondary,
  },
  backButton: { padding: 4 },
  headerTitle: { color: t.onSurface, fontSize: 18, fontWeight: "800" },
  headerSpacer: { width: 32 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  profileHero: { alignItems: "center", paddingVertical: spacing.lg },
  avatar: { width: 112, height: 112, borderRadius: 56, borderWidth: 3, borderColor: t.brandPrimary },
  avatarFallback: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.brand,
    borderWidth: 3,
    borderColor: t.brandPrimary,
  },
  avatarText: { color: t.onBrandPrimary, fontSize: 38, fontWeight: "800" },
  name: { color: t.onSurface, fontSize: 25, fontWeight: "800", marginTop: spacing.md, textAlign: "center" },
  level: { color: t.brandPrimary, fontSize: 14, fontWeight: "700", marginTop: 6 },
  detailLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  detailText: { color: t.onSurfaceMuted, fontSize: 14 },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: t.surfaceSecondary,
    ...shadow1,
  },
  statValue: { color: t.onSurface, fontSize: 20, fontWeight: "800", marginTop: 5 },
  statLabel: { color: t.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  section: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.md, backgroundColor: t.surfaceSecondary, ...shadow1 },
  sectionTitle: { color: t.onSurface, fontSize: 16, fontWeight: "800", marginBottom: 8 },
  bio: { color: t.onSurfaceMuted, fontSize: 15, lineHeight: 22 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: spacing.lg },
  stateText: { color: t.onSurfaceMuted, fontSize: 15 },
});

let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});

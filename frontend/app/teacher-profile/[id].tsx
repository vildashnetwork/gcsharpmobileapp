import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/src/theme-context";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { api } from "@/src/api";

type TeacherProfile = {
  user_id: string;
  full_name: string;
  profile_photo?: string | null;
  bio?: string;
  institution?: string;
  specialization?: string;
  exam_level?: string;
  role?: string;
  created_at?: string;
};

type TeacherVideo = {
  course_id: string;
  title: string;
  subject_name: string;
  exam_level: string;
  thumbnail: string;
  duration: string;
  views: number;
};

type ProfileResponse = {
  teacher: TeacherProfile;
  followers: number;
  is_following: boolean;
  videos: TeacherVideo[];
  total_views: number;
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
}

export default function TeacherProfile() {
  useTheme(); // re-render on light/dark change
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await api<ProfileResponse>(`/teachers/${id}`, { auth: true });
      setData(r);
    } catch (e: any) {
      setErr(e.message || "Could not load this teacher's profile");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggleFollow = async () => {
    if (!data || followBusy) return;
    setFollowBusy(true);
    const prev = data;
    // Optimistic update
    setData({
      ...data,
      is_following: !data.is_following,
      followers: data.followers + (data.is_following ? -1 : 1),
    });
    try {
      const r = await api<{ following: boolean; followers: number }>(
        `/teachers/${id}/follow`, { method: "POST" }
      );
      setData((d) => d ? { ...d, is_following: r.following, followers: r.followers } : d);
    } catch (e: any) {
      setData(prev); // revert
      Alert.alert("Could not update", e.message || "Follow failed. Try again.");
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
          <Text style={styles.brand}>GCSHARP</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.brandPrimary} />
          <Text style={styles.muted}>Loading profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (err || !data) {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
          <Text style={styles.brand}>GCSHARP</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.centerBox}>
          <Ionicons name="person-circle-outline" size={48} color={theme.error} />
          <Text style={styles.muted}>{err || "Teacher not found"}</Text>
          <Pressable style={styles.retryBtn} onPress={load} testID="retry-profile">
            <Text style={styles.retryTxt}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const t = data.teacher;

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="teacher-profile-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
        <Text style={styles.brand}>GCSHARP</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ---- Identity ---- */}
        <View style={styles.profileHead}>
          {t.profile_photo ? (
            <Image source={{ uri: t.profile_photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{(t.full_name || "T").charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.name}>{t.full_name}</Text>
          {(t.specialization || t.institution) ? (
            <Text style={styles.sub} numberOfLines={1}>
              {[t.specialization, t.institution].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
          {t.bio ? <Text style={styles.bio}>{t.bio}</Text> : null}

          {/* ---- Stats ---- */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{formatCount(data.followers)}</Text>
              <Text style={styles.statLbl}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{data.videos.length}</Text>
              <Text style={styles.statLbl}>Lessons</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{formatCount(data.total_views)}</Text>
              <Text style={styles.statLbl}>Views</Text>
            </View>
          </View>

          {/* ---- Follow button ---- */}
          <Pressable
            style={[styles.followBtn, data.is_following && styles.followingBtn, followBusy && { opacity: 0.7 }]}
            onPress={toggleFollow}
            disabled={followBusy}
            testID="follow-btn"
          >
            {followBusy ? (
              <ActivityIndicator size="small" color={data.is_following ? theme.brand : "#fff"} />
            ) : (
              <>
                <Ionicons name={data.is_following ? "person-remove" : "person-add"} size={16} color={data.is_following ? theme.brand : "#fff"} />
                <Text style={[styles.followTxt, data.is_following && styles.followingTxt]} testID="follow-label">
                  {data.is_following ? "Following" : "Follow"}
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.divider} />

        {/* ---- Lessons ---- */}
        <Text style={styles.sectionTitle}>Lessons by {t.full_name.split(" ")[0]}</Text>
        {data.videos.length === 0 ? (
          <Text style={styles.empty}>No lessons published yet.</Text>
        ) : (
          data.videos.map((v) => (
            <Pressable
              key={v.course_id}
              style={styles.videoRow}
              onPress={() => router.push(`/library/${v.course_id}`)}
              testID={`teacher-video-${v.course_id}`}
            >
              <View style={styles.thumbWrap}>
                <Image source={{ uri: v.thumbnail }} style={styles.thumb} />
                <View style={styles.durTag}><Text style={styles.durTxt}>{v.duration || ""}</Text></View>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.videoTitle} numberOfLines={2}>{v.title}</Text>
                <Text style={styles.videoMeta} numberOfLines={1}>
                  {[v.subject_name, v.exam_level].filter(Boolean).join(" · ")}
                </Text>
                <Text style={styles.videoMeta}>{formatCount(v.views || 0)} views</Text>
              </View>
              <Ionicons name="play-circle" size={26} color={theme.brandPrimary} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  brand: { fontSize: 16, fontWeight: "800", color: t.brand, letterSpacing: 1 },
  centerBox: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: spacing.lg },
  muted: { color: t.onSurfaceMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: t.brandPrimary },
  retryTxt: { color: "#fff", fontWeight: "800" },

  profileHead: { alignItems: "center", paddingHorizontal: spacing.lg, gap: 8 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: t.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: t.brandTertiary },
  avatarInitial: { color: t.onBrandTertiary, fontWeight: "800", fontSize: 34 },
  name: { fontSize: 20, fontWeight: "800", color: t.onSurface, marginTop: 4 },
  sub: { fontSize: 13, color: t.onSurfaceMuted, fontWeight: "600" },
  bio: { fontSize: 13, color: t.onSurfaceMuted, textAlign: "center", lineHeight: 19, marginTop: 2 },

  statsRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  stat: { alignItems: "center", paddingHorizontal: 20 },
  statNum: { fontSize: 17, fontWeight: "800", color: t.onSurface },
  statLbl: { fontSize: 11.5, color: t.onSurfaceMuted, fontWeight: "600" },
  statDivider: { width: 1, height: 26, backgroundColor: t.border },

  followBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12,
    backgroundColor: t.brandPrimary, paddingHorizontal: 28, paddingVertical: 10,
    borderRadius: radii.pill, ...shadow1,
  },
  followingBtn: { backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.brandPrimary },
  followTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  followingTxt: { color: t.brand },

  divider: { height: 8, backgroundColor: t.surfaceTertiary, marginTop: spacing.lg, marginBottom: spacing.md },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: t.onSurface, paddingHorizontal: spacing.lg, marginBottom: 6 },
  empty: { color: t.onSurfaceMuted, fontSize: 13, paddingHorizontal: spacing.lg, paddingVertical: 16 },

  videoRow: { flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 8, alignItems: "center" },
  thumbWrap: { position: "relative", ...shadow1 },
  thumb: { width: 150, height: 84, borderRadius: 8, backgroundColor: t.surfaceTertiary },
  durTag: { position: "absolute", right: 4, bottom: 4, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 },
  durTxt: { color: "#fff", fontSize: 10, fontWeight: "700" },
  videoTitle: { color: t.onSurface, fontWeight: "700", fontSize: 13.5, lineHeight: 18 },
  videoMeta: { color: t.onSurfaceMuted, fontSize: 12 },
});

// Rebuild module styles whenever the active palette changes so the
// screen picks up light/dark without prop drilling (same pattern as
// the other detail screens).
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});
import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, ActivityIndicator, Alert, Modal, Share, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { GestureHandlerRootView, PinchGestureHandler, PanGestureHandler, TapGestureHandler } from "react-native-gesture-handler";
import { useTheme } from "@/src/theme-context";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

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
  total_earnings?: number;
  is_self?: boolean;
};

// Full-screen photo viewer: pinch to zoom, drag when zoomed, double-tap
// toggles 2.5x. Built with react-native-gesture-handler (already in the
// app via expo-router) — no extra dependency needed.
function PhotoViewer({ uri, visible, onClose }: { uri: string | null; visible: boolean; onClose: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScale = useRef(1);
  const lastTranslate = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (visible) {
      lastScale.current = 1;
      lastTranslate.current = { x: 0, y: 0 };
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    }
  }, [visible, scale, translateX, translateY]);

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const onPinchEvent = (e: any) => {
    scale.setValue(clamp(lastScale.current * e.nativeEvent.scale, 1, 6));
  };
  const onPinchEnd = (e: any) => {
    lastScale.current = clamp(lastScale.current * e.nativeEvent.scale, 1, 6);
    if (lastScale.current <= 1.02) {
      // Pinched back down to normal — reset everything.
      lastScale.current = 1;
      lastTranslate.current = { x: 0, y: 0 };
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    }
  };
  const onPanEvent = (e: any) => {
    if (lastScale.current <= 1) return; // panning only makes sense zoomed in
    translateX.setValue(lastTranslate.current.x + e.nativeEvent.translationX);
    translateY.setValue(lastTranslate.current.y + e.nativeEvent.translationY);
  };
  const onPanEnd = (e: any) => {
    if (lastScale.current <= 1) return;
    lastTranslate.current = {
      x: lastTranslate.current.x + e.nativeEvent.translationX,
      y: lastTranslate.current.y + e.nativeEvent.translationY,
    };
  };
  const onDoubleTap = () => {
    if (lastScale.current > 1) {
      lastScale.current = 1;
      lastTranslate.current = { x: 0, y: 0 };
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
      ]).start();
    } else {
      lastScale.current = 2.5;
      Animated.spring(scale, { toValue: 2.5, useNativeDriver: true }).start();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.96)" }}>
        <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchEnd}>
          <PanGestureHandler onGestureEvent={onPanEvent} onHandlerStateChange={onPanEnd}>
            <TapGestureHandler numberOfTaps={2} onActivated={onDoubleTap}>
              <Animated.View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Animated.Image
                  source={{ uri: uri ?? undefined }}
                  style={{
                    width: "100%",
                    height: "70%",
                    transform: [{ translateX }, { translateY }, { scale }],
                  }}
                  resizeMode="contain"
                />
              </Animated.View>
            </TapGestureHandler>
          </PanGestureHandler>
        </PinchGestureHandler>
        <Pressable onPress={onClose} style={styles.viewerClose} testID="photo-viewer-close">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.viewerHint}>Pinch to zoom · Double-tap · Drag when zoomed</Text>
      </GestureHandlerRootView>
    </Modal>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
}

export default function TeacherProfile() {
  useTheme(); // re-render on light/dark change
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

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

  // Reload every time the screen regains focus — e.g. returning from
  // Edit Profile so photo/bio changes show immediately.
  useFocusEffect(useCallback(() => { load(); }, [load]));

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
  // Viewing your own profile → setup mode instead of follow mode.
  const isSelf = !!data.is_self || (!!user && user.user_id === t.user_id);
  const displayName = (t.full_name || user?.full_name || "Teacher").trim();

  const shareProfile = async () => {
    try {
      const link = `https://gcsharp.com/teacher-profile/${t.user_id}`;
      await Share.share({
        title: `${displayName} on GC SHARP`,
        message: `Check out ${displayName}'s profile and lessons on GC SHARP: ${link}`,
        url: link,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="teacher-profile-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.brand} /></Pressable>
        <Text style={styles.brand}>GCSHARP</Text>
        <Pressable onPress={shareProfile} testID="share-profile-btn">
          <Ionicons name="share-social-outline" size={22} color={theme.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ---- Identity ---- */}
        <View style={styles.profileHead}>
          <Pressable
            onPress={() => t.profile_photo && setViewerUri(t.profile_photo)}
            disabled={!t.profile_photo}
            testID="profile-photo-open"
          >
            {t.profile_photo ? (
              <Image source={{ uri: t.profile_photo }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </Pressable>
          {!!t.profile_photo && (
            <Pressable onPress={() => setViewerUri(t.profile_photo as string)} testID="zoom-photo-btn">
              <Text style={styles.zoomHint}>Tap photo to zoom</Text>
            </Pressable>
          )}
          <Text style={styles.name}>{displayName}</Text>
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

          {/* ---- Follow (visitors) / Edit profile (self) ---- */}
          {isSelf ? (
            <>
              <View style={styles.selfBadge}>
                <Ionicons name="person-circle" size={14} color={theme.brand} />
                <Text style={styles.selfBadgeTxt}>This is your public profile</Text>
              </View>
              <Pressable
                style={[styles.followBtn, followBusy && { opacity: 0.7 }]}
                onPress={() => router.push("/edit-profile")}
                testID="edit-profile-btn"
              >
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={styles.followTxt}>Set up my profile</Text>
              </Pressable>
              {(data.total_earnings ?? 0) > 0 ? (
                <View style={styles.earnCard}>
                  <Ionicons name="cash-outline" size={18} color={theme.success} />
                  <Text style={styles.earnAmt}>{Math.round(data.total_earnings ?? 0).toLocaleString()} FCFA</Text>
                  <Text style={styles.earnLbl}>earned so far</Text>
                </View>
              ) : null}
            </>
          ) : (
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
          )}
        </View>

        <View style={styles.divider} />

        {/* ---- Lessons (teacher avatar + name here too) ---- */}
        <View style={styles.bylineRow}>
          {t.profile_photo ? (
            <Image source={{ uri: t.profile_photo }} style={styles.bylineAvatar} />
          ) : (
            <View style={[styles.bylineAvatar, styles.bylineFallback]}>
              <Text style={styles.bylineInitial}>{(t.full_name || "T").charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.sectionTitle} testID="lessons-by">
            Lessons by {isSelf ? "you" : (displayName.split(" ")[0] || "this teacher")}
          </Text>
        </View>
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

      <PhotoViewer uri={viewerUri} visible={!!viewerUri} onClose={() => setViewerUri(null)} />
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

  selfBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill, backgroundColor: t.brandTertiary },
  selfBadgeTxt: { color: t.brand, fontSize: 12, fontWeight: "700" },
  earnCard: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.md, backgroundColor: t.surfaceSecondary, borderWidth: 1, borderColor: t.border },
  earnAmt: { color: t.success, fontWeight: "800", fontSize: 14 },
  earnLbl: { color: t.onSurfaceMuted, fontSize: 12.5, fontWeight: "600" },

  zoomHint: { color: t.brandPrimary, fontSize: 11.5, fontWeight: "700", marginTop: 2 },

  viewerClose: { position: "absolute", top: 50, right: 22, width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  viewerHint: { position: "absolute", bottom: 44, alignSelf: "center", color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600" },

  divider: { height: 8, backgroundColor: t.surfaceTertiary, marginTop: spacing.lg, marginBottom: spacing.md },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: t.onSurface, flex: 1, flexShrink: 1 },
  bylineRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, marginBottom: 6 },
  bylineAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.surfaceTertiary },
  bylineFallback: { alignItems: "center", justifyContent: "center", backgroundColor: t.brandTertiary },
  bylineInitial: { color: t.onBrandTertiary, fontWeight: "800", fontSize: 14 },
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
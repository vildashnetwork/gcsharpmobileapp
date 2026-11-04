

// // app/(tabs)/profile.tsx
// import { View, Text, StyleSheet, Pressable, ScrollView, Image } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import { useRouter, useFocusEffect } from "expo-router";
// import { useCallback } from "react";
// import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
// import { useAuth } from "@/src/auth";

// export default function Profile() {
//   const { user, logout, refresh } = useAuth();
//   const router = useRouter();

//   // 🔄 Re‑fetch user data every time the screen is focused
//   useFocusEffect(
//     useCallback(() => {
//       refresh();
//     }, [refresh])
//   );

//   const getInitials = (name?: string) => {
//     if (!name) return "U";
//     return name
//       .split(" ")
//       .map((s) => s[0])
//       .slice(0, 2)
//       .join("")
//       .toUpperCase();
//   };

//   const doLogout = async () => {
//     await logout();
//     router.replace("/welcome");
//   };

//   return (
//     <SafeAreaView edges={["top"]} style={styles.root} testID="profile-screen">
//       <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 32 }}>
//         {/* Profile header with image or fallback */}
//         <View style={styles.head}>
//           <Pressable onPress={() => router.push("/edit-profile")} style={styles.avatarTouch}>
//             {user?.profile_photo ? (
//               <Image source={{ uri: user.profile_photo }} style={styles.avatarImage} />
//             ) : (
//               <View style={styles.avatarFallback}>
//                 <Text style={styles.avatarTxt}>{getInitials(user?.full_name)}</Text>
//               </View>
//             )}
//           </Pressable>
//           <Text style={styles.name}>{user?.full_name}</Text>
//           <Text style={styles.email}>{user?.email}</Text>
//           <View style={styles.pill}>
//             <Text style={styles.pillTxt}>{user?.exam_level ?? "GCE A Level"}</Text>
//           </View>
//         </View>

//         <View style={styles.metricsRow}>
//           <Metric icon="flame" label="Streak" value={String(user?.streak ?? 0)} tint={theme.warning} />
//           <Metric icon="trophy-outline" label="Level" value={String(user?.level ?? 1)} tint={theme.brandPrimary} />
//           <Metric icon="star" label="XP" value={String(user?.xp ?? 0)} tint={theme.success} />
//         </View>

//         <Row icon="create-outline" label="Edit Profile" onPress={() => router.push("/edit-profile")} testID="row-edit" />
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
//   avatarTouch: {},
//   avatarImage: {
//     width: 84,
//     height: 84,
//     borderRadius: 42,
//     borderWidth: 2,
//     borderColor: theme.brandPrimary,
//   },
//   avatarFallback: {
//     width: 84,
//     height: 84,
//     borderRadius: 42,
//     backgroundColor: theme.brand,
//     alignItems: "center",
//     justifyContent: "center",
//     borderWidth: 2,
//     borderColor: theme.brandPrimary,
//   },
//   avatarTxt: { color: "#fff", fontSize: 32, fontWeight: "800" },
//   name: { fontSize: 20, fontWeight: "800", color: theme.onSurface, marginTop: 4 },
//   email: { color: theme.onSurfaceMuted },
//   pill: {
//     marginTop: 6,
//     paddingHorizontal: 12,
//     paddingVertical: 4,
//     borderRadius: radii.pill,
//     backgroundColor: theme.brandTertiary,
//   },
//   pillTxt: { color: theme.onBrandTertiary, fontWeight: "700", fontSize: 12 },
//   metricsRow: { flexDirection: "row", gap: spacing.sm },
//   metric: {
//     flex: 1,
//     backgroundColor: "#fff",
//     padding: spacing.md,
//     borderRadius: radii.md,
//     alignItems: "center",
//     ...shadow1,
//   },
//   metricVal: { fontSize: 20, fontWeight: "800", color: theme.onSurface, marginTop: 4 },
//   metricLabel: { color: theme.onSurfaceMuted, fontSize: 12 },
//   row: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 12,
//     backgroundColor: "#fff",
//     padding: spacing.lg,
//     borderRadius: radii.md,
//     ...shadow1,
//   },
//   rowTxt: { flex: 1, fontWeight: "600", color: theme.onSurface, fontSize: 15 },
// });
























// app/(tabs)/profile.tsx
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, Switch, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme, spacing, radii, shadow1 } from "@/src/theme";
import { getPaletteSnapshot, subscribeTheme, type Palette } from "@/src/theme";
import { useThemeMode, type ThemePref } from "@/src/theme-context";
import { useAuth } from "@/src/auth";
import { storage } from "@/src/utils/storage";
import { useLanguage, type Lang } from "@/src/i18n";
import { GlobalAppHeader } from "@/src/components/GlobalAppHeader";
import { api } from "@/src/api";
import {
  cacheOfflineAccess,
  OFFLINE_MODE_KEY,
  publishOfflineModePreference,
  type OfflineAccessStatus,
} from "@/src/lib/offlineAccess";

const HELP_CENTER_URL = "https://support.gcsharp.com";

export default function Profile() {
  useTheme(); // re-render this screen when light/dark changes
  const { pref, setPref } = useThemeMode();
  const { user, logout, refresh } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const router = useRouter();
  const [aiTokens, setAiTokens] = useState<number | null>(null);
  const [aiTokensLoading, setAiTokensLoading] = useState(true);
  const [aiTokensError, setAiTokensError] = useState(false);
  const [offlineAccess, setOfflineAccess] = useState<OfflineAccessStatus | null>(null);
  const [offlineAccessLoading, setOfflineAccessLoading] = useState(true);
  const [offlineAccessError, setOfflineAccessError] = useState(false);

  const loadAiTokens = useCallback(async () => {
    setAiTokensLoading(true);
    setAiTokensError(false);
    try {
      const balance = await api<{ remaining: number }>("/ai/tokens");
      setAiTokens(balance.remaining);
    } catch (error) {
      console.error("Failed to load AI token balance", error);
      setAiTokensError(true);
    } finally {
      setAiTokensLoading(false);
    }
  }, []);

  const loadOfflineAccess = useCallback(async () => {
    setOfflineAccessLoading(true);
    setOfflineAccessError(false);
    try {
      const status = await api<OfflineAccessStatus>(
        "/offline/access",
        { cacheFallback: false },
      );
      setOfflineAccess(status);
      if (user?.user_id) {
        const cached = await cacheOfflineAccess(user.user_id, status);
        if (!cached) {
          console.error("Could not securely cache offline access expiry.");
        }
      }
    } catch (error) {
      console.error("Failed to load offline access", error);
      setOfflineAccessError(true);
    } finally {
      setOfflineAccessLoading(false);
    }
  }, [user]);

  // === Offline mode toggle ===
  const [isOffline, setIsOffline] = useState(false);
  const [modeLoading, setModeLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await storage.getItem<boolean>(OFFLINE_MODE_KEY, false);
        const enabled = !!saved;
        setIsOffline(enabled);
        publishOfflineModePreference(enabled);
      } catch (e) {
        console.warn("Failed to load offline mode preference", e);
      } finally {
        setModeLoading(false);
      }
    })();
  }, []);

  const toggleOfflineMode = async (value: boolean) => {
    if (value && offlineAccessLoading) return;
    if (value && !offlineAccess?.active) {
      Alert.alert(
        "Offline access required",
        "Your free offline trial has ended. Subscribe to keep using downloaded content offline.",
      );
      return;
    }
    setIsOffline(value); // optimistic update
    try {
      const saved = await storage.setItem(OFFLINE_MODE_KEY, value);
      if (!saved) throw new Error("Could not save offline mode preference.");
      publishOfflineModePreference(value);
    } catch (e) {
      console.warn("Failed to persist offline mode preference", e);
      setIsOffline(!value); // revert on failure
    }
  };

  // 🔄 Re‑fetch user data every time the screen is focused
  useFocusEffect(
    useCallback(() => {
      refresh();
      void loadAiTokens();
      void loadOfflineAccess();
    }, [refresh, loadAiTokens, loadOfflineAccess])
  );

  const openTokenPurchase = async () => {
    try {
      await Linking.openURL("https://gcsharp.com/pay");
    } catch (error) {
      console.error("Could not open the AI token purchase page", error);
      Alert.alert("Unable to open page", "Please try again later.");
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  const doLogout = async () => {
    await logout();
    router.replace("/welcome");
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="profile-screen">
      <GlobalAppHeader onSearchPress={() => router.push("/(tabs)/papers")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 32 }}>
        {/* Profile header with image or fallback */}
        <View style={styles.head}>
          <View style={styles.headProfileRow}>
            <Pressable onPress={() => router.push("/edit-profile")} style={styles.avatarTouch}>
              {user?.profile_photo ? (
                <Image source={{ uri: user.profile_photo }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarTxt}>{getInitials(user?.full_name)}</Text>
                </View>
              )}
            </Pressable>
            <View style={styles.profileIdentity}>
              <Text style={styles.name} numberOfLines={2}>{user?.full_name}</Text>
              <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
              <View style={styles.pill}>
                <Text style={styles.pillTxt}>{user?.exam_level || "Teacher"}</Text>
              </View>
            </View>
          </View>
          <View style={styles.offlineDaysRow} testID="profile-offline-days">
            <Ionicons
              name="cloud-download-outline"
              size={17}
              color={offlineAccess?.active ? theme.success : theme.onSurfaceMuted}
            />
            <Text style={styles.offlineDaysText}>
              {offlineAccessLoading
                ? "Checking offline access..."
                : offlineAccessError
                  ? "Offline access status unavailable"
                  : offlineAccess?.active
                    ? `${offlineAccess.remaining_days} day${offlineAccess.remaining_days === 1 ? "" : "s"} left for offline mode`
                    : "Offline access has expired"}
            </Text>
          </View>
        </View>

        {/* Appearance: Light / Dark / System */}
        <View style={styles.modeCard} testID="theme-toggle-card">
          <View style={styles.modeLeft}>
            <View style={[styles.modeIconWrap, { backgroundColor: theme.brandTertiary }]}>
              <Ionicons
                name={pref === "dark" ? "moon" : pref === "light" ? "sunny" : "contrast-outline"}
                size={18}
                color={theme.onBrandTertiary}
              />
            </View>
            <View>
              <Text style={styles.modeTitle}>{t.profile.appearance}</Text>
              <Text style={styles.modeSub}>
                {pref === "system" ? t.profile.systemMode : pref === "dark" ? t.profile.darkMode : t.profile.lightMode}
              </Text>
            </View>
          </View>
          <View style={styles.segRow}>
            {(
              [
                { key: "light", icon: "sunny-outline" as const },
                { key: "dark", icon: "moon-outline" as const },
                { key: "system", icon: "phone-portrait-outline" as const },
              ] as { key: ThemePref; icon: any }[]
            ).map((opt) => {
              const active = pref === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  testID={`theme-${opt.key}`}
                  onPress={() => setPref(opt.key)}
                  style={[styles.segBtn, active && styles.segBtnActive]}
                  hitSlop={4}
                >
                  <Ionicons
                    name={opt.icon}
                    size={15}
                    color={active ? theme.onBrandPrimary : theme.onSurfaceMuted}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Language: English / French — stored locally only */}
        <View style={styles.modeCard} testID="language-card">
          <View style={styles.modeLeft}>
            <View style={[styles.modeIconWrap, { backgroundColor: theme.brandTertiary }]}>
              <Ionicons name="language-outline" size={18} color={theme.onBrandTertiary} />
            </View>
            <View>
              <Text style={styles.modeTitle}>{t.profile.language}</Text>
              <Text style={styles.modeSub}>{t.profile.languageDesc}</Text>
            </View>
          </View>
          <View style={styles.segRow}>
            {(
              [
                { key: "en" as const, label: "EN" },
                { key: "fr" as const, label: "FR" },
              ] as { key: Lang; label: string }[]
            ).map((opt) => {
              const active = lang === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  testID={`profile-lang-${opt.key}`}
                  onPress={() => setLang(opt.key)}
                  style={[styles.segBtnWide, active && styles.segBtnActive]}
                  hitSlop={4}
                >
                  <Text
                    style={[
                      styles.segBtnTxt,
                      { color: active ? theme.onBrandPrimary : theme.onSurfaceMuted },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Online / Offline mode toggle */}
        <View style={styles.modeCard} testID="mode-toggle-card">
          <View style={styles.modeLeft}>
            <View style={[styles.modeIconWrap, { backgroundColor: isOffline ? theme.borderStrong : theme.brandTertiary }]}>
              <Ionicons
                name={isOffline ? "cloud-offline-outline" : "cloud-done-outline"}
                size={18}
                color={isOffline ? theme.onSurfaceMuted : theme.onBrandTertiary}
              />
            </View>
            <View>
              <Text style={styles.modeTitle}>{isOffline ? t.common.offline : t.common.online}</Text>
              <Text style={styles.modeSub}>
                {isOffline
                  ? lang === "fr" ? "Contenu téléchargé uniquement" : "Using downloaded content only"
                  : lang === "fr" ? "Synchronisation avec le serveur" : "Syncing with the server"}
              </Text>
            </View>
          </View>
          <Switch
            testID="offline-mode-switch"
            value={!isOffline}
            onValueChange={(online) => toggleOfflineMode(!online)}
            disabled={modeLoading || offlineAccessLoading}
            trackColor={{ false: theme.borderStrong, true: theme.brandPrimary }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.offlineAccessCard} testID="offline-access-card">
          <View style={styles.tokenDetails}>
            <View style={[styles.modeIconWrap, { backgroundColor: theme.brandTertiary }]}>
              <Ionicons name="cloud-download-outline" size={18} color={theme.onBrandTertiary} />
            </View>
            <View style={styles.tokenCopy}>
              <Text style={styles.modeTitle}>Offline access</Text>
              <Text style={styles.modeSub}>
                {offlineAccessLoading
                  ? "Checking access..."
                  : offlineAccessError
                    ? "Access status unavailable. Tap retry."
                    : offlineAccess?.active
                      ? `${offlineAccess.access_type === "subscription" ? "Monthly access" : "Free trial"} · ${offlineAccess.remaining_days} day${offlineAccess.remaining_days === 1 ? "" : "s"} left`
                      : "Your free offline trial has ended"}
              </Text>
            </View>
            {offlineAccessError ? (
              <Pressable accessibilityRole="button" onPress={() => void loadOfflineAccess()}>
                <Text style={styles.offlineRetryText}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.offlineLimitText}>
            {offlineAccess
              ? `${offlineAccess.downloads_remaining_today} of ${offlineAccess.download_limit_per_day} paper downloads left today`
              : "Download up to 10 papers per day for offline study"}
          </Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => void openTokenPurchase()}
            style={styles.tokenPurchaseButton}
            testID="buy-offline-access"
          >
            <Text style={styles.tokenPurchaseText}>Subscribe monthly</Text>
            <Ionicons name="open-outline" size={16} color={theme.onBrandPrimary} />
          </Pressable>
        </View>

        <View style={styles.metricsRow}>
          <Metric icon="flame" label={t.home.streak} value={String(user?.streak ?? 0)} tint={theme.warning} />
          <Metric icon="trophy-outline" label={t.home.level} value={String(user?.level ?? 1)} tint={theme.brandPrimary} />
          <Metric icon="star" label={t.home.xp} value={String(user?.xp ?? 0)} tint={theme.success} />
        </View>

        <View style={styles.tokenCard} testID="ai-token-balance-card">
          <View style={styles.tokenDetails}>
            <View style={[styles.modeIconWrap, { backgroundColor: theme.brandTertiary }]}>
              <Ionicons name="flash-outline" size={18} color={theme.onBrandTertiary} />
            </View>
            <View style={styles.tokenCopy}>
              <Text style={styles.modeTitle}>GC AI tokens</Text>
              <Text style={styles.modeSub}>
                {aiTokensLoading
                  ? "Loading balance..."
                  : aiTokensError
                    ? "Balance unavailable. Tap to retry."
                    : "Tokens remaining"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={aiTokensError ? "Retry loading AI token balance" : `AI tokens remaining: ${aiTokens ?? 0}`}
              disabled={aiTokensLoading}
              onPress={() => aiTokensError && void loadAiTokens()}
              style={styles.tokenBalanceButton}
            >
              <Text style={styles.tokenBalance}>{aiTokensLoading ? "—" : aiTokensError ? "Retry" : aiTokens}</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => void openTokenPurchase()}
            style={styles.tokenPurchaseButton}
            testID="buy-ai-tokens"
          >
            <Text style={styles.tokenPurchaseText}>Get more tokens</Text>
            <Ionicons name="open-outline" size={16} color={theme.onBrandPrimary} />
          </Pressable>
        </View>

        <Row icon="home-outline" label={t.tabs.home} onPress={() => router.push("/")} testID="row-dashboard" />
        <Row icon="create-outline" label={t.profile.editProfile} onPress={() => router.push("/edit-profile")} testID="row-edit" />
        <Row icon="stats-chart-outline" label={t.stats.title} onPress={() => router.push("/stats")} testID="row-stats" />
        <Row icon="bookmark-outline" label={t.profile.drafts} onPress={() => router.push("/drafts")} testID="row-drafts" />
        <Row icon="document-text-outline" label={t.pastQuestions.title} onPress={() => router.push("/past-questions")} testID="row-pastq" />
        <Row icon="chatbubble-ellipses-outline" label={t.tabs.ai} onPress={() => router.push("/(tabs)/ai")} testID="row-ai" />
        <Row icon="people-outline" label={t.tabs.groups} onPress={() => router.push("/(tabs)/groups")} testID="row-groups" />
        <Row icon="videocam-outline" label={t.tabs.lessons} onPress={() => router.push("/(tabs)/lessons")} testID="row-lessons" />
        <Row icon="book-outline" label={t.tabs.library} onPress={() => router.push("/(tabs)/library")} testID="row-library" />
        {(user?.role === "teacher" || user?.role === "admin") && (
          <>
            <Row icon="cloud-upload-outline" label={t.tabs.upload} onPress={() => router.push("/(tabs)/teacher-upload")} testID="row-teacher-upload" />
            <Row
              icon="person-circle-outline"
              label="My Teacher Profile"
              onPress={() => user.user_id && router.push(`/teacher-profile/${user.user_id}` as any)}
              testID="row-teacher-profile"
            />
          </>
        )}
        <Row icon="help-circle-outline" label="Help Center" onPress={() => Linking.openURL(HELP_CENTER_URL)} testID="row-help-center" />


        <Row
          icon="globe-outline"
          label="Use Web"
          onPress={() => Linking.openURL("https://www.gcsharp.com")}
          testID="row-help-center"
        />



        <Row icon="book-outline" label="User guide" onPress={() => router.push("/user-guide" as any)} testID="row-guide" />

        <Row icon="log-out-outline" label={t.profile.logout} danger onPress={doLogout} testID="row-logout" />
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

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  head: {
    backgroundColor: t.surfaceSecondary,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow1,
  },
  headProfileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  profileIdentity: { flex: 1, minWidth: 0, gap: 3 },
  avatarTouch: { flexShrink: 0 },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: t.brandPrimary,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: t.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: t.brandPrimary,
  },
  avatarTxt: { color: t.onBrandPrimary, fontSize: 32, fontWeight: "800" },
  name: { fontSize: 20, fontWeight: "800", color: t.onSurface },
  email: { color: t.onSurfaceMuted },
  offlineDaysRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  offlineDaysText: { flex: 1, color: t.onSurface, fontSize: 13, fontWeight: "700" },
  pill: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: t.brandTertiary,
  },
  pillTxt: { color: t.onBrandTertiary, fontWeight: "700", fontSize: 12 },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: t.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radii.md,
    ...shadow1,
  },
  modeLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  modeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  modeTitle: { fontWeight: "700", color: t.onSurface, fontSize: 14 },
  modeSub: { color: t.onSurfaceMuted, fontSize: 12, marginTop: 1 },
  tokenCard: {
    backgroundColor: t.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radii.md,
    gap: spacing.md,
    ...shadow1,
  },
  offlineAccessCard: {
    backgroundColor: t.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radii.md,
    gap: spacing.sm,
    ...shadow1,
  },
  offlineLimitText: { color: t.onSurfaceMuted, fontSize: 12 },
  offlineRetryText: { color: t.brandPrimary, fontWeight: "700", fontSize: 12 },
  tokenDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tokenCopy: { flex: 1 },
  tokenBalanceButton: {
    minWidth: 54,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: t.surfaceTertiary,
  },
  tokenBalance: { color: t.brandPrimary, fontSize: 20, fontWeight: "800" },
  tokenPurchaseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: t.brandPrimary,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  tokenPurchaseText: { color: t.onBrandPrimary, fontWeight: "700" },
  segRow: {
    flexDirection: "row",
    backgroundColor: t.surfaceTertiary,
    borderRadius: radii.pill,
    padding: 2,
    gap: 2,
  },
  segBtn: {
    width: 32,
    height: 28,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segBtnActive: {
    backgroundColor: t.brandPrimary,
  },
  segBtnWide: {
    minWidth: 40,
    paddingHorizontal: 8,
    height: 28,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segBtnTxt: { fontSize: 12, fontWeight: "800" },
  metricsRow: { flexDirection: "row", gap: spacing.sm },
  metric: {
    flex: 1,
    backgroundColor: t.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radii.md,
    alignItems: "center",
    ...shadow1,
  },
  metricVal: { fontSize: 20, fontWeight: "800", color: t.onSurface, marginTop: 4 },
  metricLabel: { color: t.onSurfaceMuted, fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: t.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radii.md,
    ...shadow1,
  },
  rowTxt: { flex: 1, fontWeight: "600", color: t.onSurface, fontSize: 15 },
});

// Rebuild the module styles whenever the active palette changes so
// every consumer (including helper components outside the screen
// function) picks up light/dark without prop drilling.
let styles = createStyles(getPaletteSnapshot());
subscribeTheme(() => {
  styles = createStyles(getPaletteSnapshot());
});
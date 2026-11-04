import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { radii, spacing, type Palette } from "@/src/theme";
import { useTheme } from "@/src/theme-context";
import { useLanguage } from "@/src/i18n";

const HELP_CENTER_URL = "https://support.gcsharp.com";
const WEBSITE_URL = "https://www.gcsharp.com";
const USER_GUIDE_URL = "/user-guide";

type NavigationItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

type AppNotification = {
  _id: string;
  message: string;
  type?: string;
  link?: string;
  read: boolean;
  created_at?: string;
};

type Props = {
  statusLabel?: string;
  isLive?: boolean;
  onSearchPress: () => void;
};

export function GlobalAppHeader({ statusLabel, isLive, onSearchPress }: Props) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const { user, isOnline, logout } = useAuth();
  const { t: copy } = useLanguage();
  const live = isLive ?? isOnline;
  const userId = user?.user_id;
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    let active = true;
    api<AppNotification[]>("/notifications")
      .then((result) => {
        if (active) {
          setUnreadCount(Array.isArray(result)
            ? result.filter((notification) => !notification.read).length
            : 0);
        }
      })
      .catch((error) => {
        console.warn("[notifications] could not load unread count:", error);
      });
    return () => { active = false; };
  }, [userId]));

  const initials = (user?.full_name || "GC")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const navigateTo = (path: Href) => {
    setMenuOpen(false);
    router.push(path);
  };

  const openExternal = async (url: string) => {
    setMenuOpen(false);
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error("Could not open navigation link", error);
      Alert.alert("Unable to open page", "Please try again later.");
    }
  };

  const doLogout = async () => {
    setMenuOpen(false);
    try {
      await logout();
      router.replace("/welcome");
    } catch (error) {
      console.error("Could not log out", error);
      Alert.alert("Unable to log out", "Please try again.");
    }
  };

  const teacherItems: NavigationItem[] = (user?.role === "teacher" || user?.role === "admin")
    ? [
        { label: copy.tabs.upload, icon: "cloud-upload-outline", onPress: () => navigateTo("/(tabs)/teacher-upload") },
        {
          label: "My Teacher Profile",
          icon: "person-circle-outline",
          onPress: () => user.user_id && navigateTo(`/teacher-profile/${user.user_id}` as Href),
        },
      ]
    : [];
  const navigationItems: NavigationItem[] = [
    { label: copy.tabs.home, icon: "home-outline", onPress: () => navigateTo("/") },
    { label: copy.profile.editProfile, icon: "create-outline", onPress: () => navigateTo("/edit-profile") },
    { label: copy.stats.title, icon: "stats-chart-outline", onPress: () => navigateTo("/stats") },
    { label: copy.profile.drafts, icon: "bookmark-outline", onPress: () => navigateTo("/drafts") },
    { label: copy.pastQuestions.title, icon: "document-text-outline", onPress: () => navigateTo("/past-questions") },
    { label: copy.tabs.ai, icon: "chatbubble-ellipses-outline", onPress: () => navigateTo("/(tabs)/ai") },
    { label: copy.tabs.groups, icon: "people-outline", onPress: () => navigateTo("/(tabs)/groups") },
    { label: copy.tabs.lessons, icon: "videocam-outline", onPress: () => navigateTo("/(tabs)/lessons") },
    { label: copy.tabs.library, icon: "book-outline", onPress: () => navigateTo("/(tabs)/library") },
    ...teacherItems,
    { label: "Help Center", icon: "help-circle-outline", onPress: () => void openExternal(HELP_CENTER_URL) },
    { label: "Use Web", icon: "globe-outline", onPress: () => void openExternal(WEBSITE_URL) },
    { label: "User guide", icon: "book-outline", onPress: () => navigateTo(USER_GUIDE_URL as Href) },
  ];

  return (
    <>
      <View style={styles.header}>
        <Pressable
          style={styles.iconButton}
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
          hitSlop={6}
        >
          <Ionicons name="menu-outline" size={24} color={t.onSurface} />
        </Pressable>

        <Pressable
          style={styles.brand}
          onPress={() => router.push("/(tabs)/feed")}
          accessibilityRole="button"
          accessibilityLabel="GC Sharp home"
        >
          <Image source={require("../../assets/images/gcsharp.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brandName}>GC Sharp</Text>
        </Pressable>

        <View style={styles.status}>
          <View style={[styles.statusDot, { backgroundColor: live ? "#16A98A" : t.onSurfaceMuted }]} />
          <Text style={styles.statusText} numberOfLines={1}>
            {statusLabel || (live ? "Live" : "Offline")}
          </Text>
        </View>

        <Pressable
          onPress={onSearchPress}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Search"
          hitSlop={6}
        >
          <Ionicons name="search-outline" size={21} color={t.onSurface} />
        </Pressable>

        <Pressable
          onPress={() => router.push("/notifications")}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
          hitSlop={6}
        >
          <Ionicons name="notifications-outline" size={21} color={t.onSurface} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={styles.avatarButton}
          onPress={() => router.push("/(tabs)/profile")}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          {user?.local_photo_uri || user?.profile_photo ? (
            <Image
              source={{ uri: user.local_photo_uri || user.profile_photo || undefined }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.drawerRoot}>
          <Pressable
            style={styles.drawerBackdrop}
            onPress={() => setMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
          />
          <SafeAreaView edges={["top", "bottom"]} style={styles.drawer}>
            <View style={styles.drawerHeader}>
              {user?.local_photo_uri || user?.profile_photo ? (
                <Image
                  source={{ uri: user.local_photo_uri || user.profile_photo || undefined }}
                  style={styles.drawerAvatar}
                />
              ) : (
                <View style={styles.drawerAvatarFallback}>
                  <Text style={styles.drawerAvatarText}>{initials}</Text>
                </View>
              )}
              <View style={styles.drawerIdentity}>
                <Text style={styles.drawerName} numberOfLines={1}>{user?.full_name || "GC Sharp"}</Text>
                {!!user?.email && <Text style={styles.drawerEmail} numberOfLines={1}>{user.email}</Text>}
              </View>
              <Pressable
                onPress={() => setMenuOpen(false)}
                style={styles.drawerClose}
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
              >
                <Ionicons name="close" size={22} color={t.onSurface} />
              </Pressable>
            </View>

            <Text style={styles.drawerSectionTitle}>Navigation</Text>
            <ScrollView
              style={styles.drawerScroll}
              contentContainerStyle={styles.drawerItems}
              showsVerticalScrollIndicator={false}
            >
              {navigationItems.map((item) => (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  style={styles.drawerItem}
                  accessibilityRole="button"
                >
                  <Ionicons name={item.icon} size={20} color={t.brandPrimary} />
                  <Text style={styles.drawerItemText}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={17} color={t.onSurfaceMuted} />
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={() => void doLogout()}
              style={[styles.drawerItem, styles.drawerLogout]}
              accessibilityRole="button"
              testID="sidebar-logout"
            >
              <Ionicons name="log-out-outline" size={20} color={t.error} />
              <Text style={[styles.drawerItemText, styles.drawerLogoutText]}>{copy.profile.logout}</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    backgroundColor: t.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: t.divider,
  },
  drawerRoot: { flex: 1, flexDirection: "row" },
  drawerBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15,23,42,0.48)",
  },
  drawer: {
    width: "84%",
    maxWidth: 340,
    backgroundColor: t.surfaceSecondary,
    paddingHorizontal: spacing.md,
    borderRightWidth: 1,
    borderRightColor: t.divider,
  },
  drawerHeader: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: t.divider,
  },
  drawerAvatar: { width: 42, height: 42, borderRadius: 21 },
  drawerAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.brandPrimary,
  },
  drawerAvatarText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  drawerIdentity: { flex: 1, minWidth: 0 },
  drawerName: { color: t.onSurface, fontWeight: "800", fontSize: 14 },
  drawerEmail: { color: t.onSurfaceMuted, fontSize: 11, marginTop: 2 },
  drawerClose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: t.surfaceTertiary,
  },
  drawerSectionTitle: {
    color: t.onSurfaceMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  drawerScroll: { flex: 1 },
  drawerItems: { paddingBottom: spacing.sm },
  drawerItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  drawerItemText: { flex: 1, color: t.onSurface, fontSize: 14, fontWeight: "600" },
  drawerLogout: {
    borderTopWidth: 1,
    borderTopColor: t.divider,
    borderRadius: 0,
    marginBottom: spacing.xs,
    paddingTop: spacing.xs,
  },
  drawerLogoutText: { color: t.error },
  brand: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 100, gap: 4 },
  logo: { width: 29, height: 34 },
  brandName: { color: t.onSurface, fontSize: 15, fontWeight: "700", letterSpacing: -0.3 },
  status: {
    maxWidth: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: t.brandTertiary,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { color: t.onBrandTertiary, fontSize: 10, fontWeight: "700" },
  iconButton: { width: 32, height: 36, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C62828",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  avatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    padding: 2,
    borderWidth: 1,
    borderColor: t.borderStrong,
  },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  avatarFallback: {
    flex: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.brandPrimary,
  },
  avatarText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});

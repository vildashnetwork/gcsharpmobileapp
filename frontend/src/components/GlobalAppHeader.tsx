import { useCallback, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { radii, spacing, type Palette } from "@/src/theme";
import { useTheme } from "@/src/theme-context";

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
  const { user, isOnline } = useAuth();
  const live = isLive ?? isOnline;
  const userId = user?.user_id;
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

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

  return (
      <View style={styles.header}>
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

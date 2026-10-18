import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState(false);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError(false);
    try {
      const result = await api<AppNotification[]>("/notifications");
      setNotifications(Array.isArray(result) ? result : []);
    } catch (error) {
      console.warn("[notifications] could not load notifications:", error);
      setNotificationsError(true);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(() => void loadNotifications(), 0);
    return () => clearTimeout(timer);
  }, [loadNotifications, userId]);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const openNotifications = () => {
    setNotificationOpen(true);
    void loadNotifications();
  };

  const openNotification = async (notification: AppNotification) => {
    if (!notification.read) {
      setNotifications((current) => current.map((item) =>
        item._id === notification._id ? { ...item, read: true } : item));
      try {
        await api(`/notifications/${notification._id}/read`, { method: "PUT" });
      } catch (error) {
        setNotifications((current) => current.map((item) =>
          item._id === notification._id ? { ...item, read: false } : item));
        console.warn("[notifications] could not mark notification as read:", error);
      }
    }
    setNotificationOpen(false);
    if (notification.link?.startsWith("/")) {
      router.push(notification.link as never);
    }
  };

  const markAllRead = async () => {
    const previous = notifications;
    setNotifications(previous.map((notification) => ({ ...notification, read: true })));
    try {
      await api("/notifications/read-all", { method: "PUT" });
    } catch (error) {
      setNotifications(previous);
      console.warn("[notifications] could not mark all notifications as read:", error);
    }
  };

  const initials = (user?.full_name || "GC")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
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
          onPress={openNotifications}
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
        visible={notificationOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setNotificationOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              {unreadCount > 0 && (
                <Pressable onPress={markAllRead} accessibilityRole="button">
                  <Text style={styles.markAll}>Mark all read</Text>
                </Pressable>
              )}
            </View>
            {notificationsLoading ? (
              <ActivityIndicator color={t.brandPrimary} style={styles.modalLoading} />
            ) : notificationsError ? (
              <Pressable style={styles.modalMessage} onPress={() => void loadNotifications()}>
                <Text style={styles.modalHint}>Could not load notifications. Tap to retry.</Text>
              </Pressable>
            ) : notifications.length === 0 ? (
              <Text style={styles.modalHint}>No notifications yet.</Text>
            ) : (
              <ScrollView style={styles.notificationList} keyboardShouldPersistTaps="handled">
                {notifications.slice(0, 30).map((notification) => (
                  <Pressable
                    key={notification._id}
                    style={styles.notificationRow}
                    onPress={() => void openNotification(notification)}
                  >
                    <View style={[styles.notificationDot, !notification.read && styles.notificationDotUnread]} />
                    <Text style={styles.notificationText}>{notification.message}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
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
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 72,
    paddingHorizontal: spacing.md,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  modalCard: {
    maxHeight: "70%",
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: t.surfaceSecondary,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  modalTitle: { color: t.onSurface, fontSize: 17, fontWeight: "800" },
  markAll: { color: t.brandPrimary, fontSize: 12, fontWeight: "700" },
  modalLoading: { paddingVertical: spacing.xl },
  modalHint: { color: t.onSurfaceMuted, fontSize: 13, lineHeight: 19, paddingVertical: spacing.md },
  modalMessage: { minHeight: 54 },
  notificationList: { flexGrow: 0 },
  notificationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: t.divider,
  },
  notificationDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: t.borderStrong },
  notificationDotUnread: { backgroundColor: t.brandPrimary },
  notificationText: { flex: 1, color: t.onSurface, fontSize: 13, lineHeight: 19 },
});

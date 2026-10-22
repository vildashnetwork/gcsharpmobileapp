import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { radii, spacing, type Palette } from "@/src/theme";
import { getNotificationHref } from "@/src/lib/notificationNavigation";

type AppNotification = {
  _id: string;
  message: string;
  type?: string;
  link?: string;
  read: boolean;
  created_at?: string;
};

function iconForType(type?: string): keyof typeof Ionicons.glyphMap {
  if (type === "ai_reply" || type === "ai_answer") return "sparkles-outline";
  if (type === "reply") return "chatbubble-ellipses-outline";
  if (type === "streak") return "flame-outline";
  if (type === "reminder") return "time-outline";
  if (type === "lesson") return "play-circle-outline";
  return "notifications-outline";
}

function formatNotificationDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function NotificationsScreen() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await api<AppNotification[]>("/notifications");
      setNotifications(Array.isArray(result) ? result : []);
    } catch (cause) {
      console.warn("[notifications] could not load notifications:", cause);
      setError(cause instanceof Error ? cause.message : "Could not load notifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadNotifications();
  }, [loadNotifications]));

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const openNotification = async (notification: AppNotification) => {
    if (!notification.read) {
      setNotifications((current) => current.map((item) =>
        item._id === notification._id ? { ...item, read: true } : item));
      try {
        await api(`/notifications/${notification._id}/read`, { method: "PUT" });
      } catch (cause) {
        setNotifications((current) => current.map((item) =>
          item._id === notification._id ? { ...item, read: false } : item));
        console.warn("[notifications] could not mark notification as read:", cause);
      }
    }

    const href = getNotificationHref(notification.link);
    if (href) router.push(href);
  };

  const markAllRead = async () => {
    const previous = notifications;
    setNotifications(previous.map((notification) => ({ ...notification, read: true })));
    setMarkingAll(true);
    try {
      await api("/notifications/read-all", { method: "PUT" });
    } catch (cause) {
      setNotifications(previous);
      console.warn("[notifications] could not mark all notifications as read:", cause);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={t.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>
            {unreadCount ? `${unreadCount} unread` : "You’re all caught up"}
          </Text>
        </View>
        {unreadCount > 0 && (
          <Pressable
            onPress={() => void markAllRead()}
            disabled={markingAll}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            style={styles.markAllButton}
          >
            {markingAll ? (
              <ActivityIndicator size="small" color={t.brandPrimary} />
            ) : (
              <Text style={styles.markAllText}>Mark all read</Text>
            )}
          </Pressable>
        )}
      </View>

      {loading && notifications.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.brandPrimary} />
        </View>
      ) : error && notifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={42} color={t.onSurfaceMuted} />
          <Text style={styles.emptyTitle}>Couldn’t load notifications</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => void loadNotifications()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          contentContainerStyle={notifications.length ? styles.list : styles.emptyList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadNotifications(true)}
              tintColor={t.brandPrimary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="notifications-off-outline" size={42} color={t.onSurfaceMuted} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>Updates about your learning will show up here.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.notificationRow, item.read && styles.notificationRead]}
              onPress={() => void openNotification(item)}
              accessibilityRole="button"
              accessibilityLabel={`Notification${item.read ? "" : ", unread"}: ${item.message}`}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={iconForType(item.type)} size={20} color={t.brandPrimary} />
              </View>
              <View style={styles.notificationCopy}>
                <Text style={styles.message}>{item.message}</Text>
                <Text style={styles.date}>{formatNotificationDate(item.created_at)}</Text>
              </View>
              {!item.read && <View style={styles.unreadDot} />}
              {item.link && (
                <Ionicons name="chevron-forward" size={18} color={t.onSurfaceMuted} />
              )}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.surface },
  header: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: t.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: t.divider,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: t.surface,
  },
  headerCopy: { flex: 1 },
  title: { color: t.onSurface, fontSize: 20, fontWeight: "800" },
  subtitle: { color: t.onSurfaceMuted, fontSize: 12, marginTop: 3 },
  markAllButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 4 },
  markAllText: { color: t.brandPrimary, fontSize: 12, fontWeight: "700" },
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  emptyList: { flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.md,
    marginBottom: 9,
    borderRadius: radii.md,
    backgroundColor: t.surfaceSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  notificationRead: { opacity: 0.68 },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: t.brandTertiary,
  },
  notificationCopy: { flex: 1, gap: 5 },
  message: { color: t.onSurface, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  date: { color: t.onSurfaceMuted, fontSize: 11 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.brandPrimary },
  center: { alignItems: "center", justifyContent: "center", gap: 10, padding: spacing.xl },
  emptyTitle: { color: t.onSurface, fontSize: 16, fontWeight: "700", textAlign: "center" },
  emptyText: { color: t.onSurfaceMuted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: t.brandPrimary,
  },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});

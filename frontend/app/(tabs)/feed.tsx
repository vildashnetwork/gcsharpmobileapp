/**
 * Learning Feed tab (Phase 1 + 5 + 7).
 *
 * Students post educational questions with images/short videos; the GCSharp
 * model attaches explanations with clickable citations. Real-time updates
 * arrive over the authenticated /api/ws/learning socket.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, RefreshControl,
  ActivityIndicator, Image, Linking, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme-context";
import { radii, spacing, shadow1, type Palette } from "@/src/theme";
import { api } from "@/src/api";
import { useLearningSocket } from "@/src/hooks/useLearningSocket";

export type FeedMedia = { type: "image" | "video"; url: string; name?: string };
export type FeedAuthor = {
  user_id: string; full_name: string; profile_photo?: string | null;
  role?: string; level?: number;
};
export type FeedCitation = { title: string; url: string };
export type FeedComment = {
  comment_id: string; body: string; author: FeedAuthor;
  parent_comment_id?: string | null; created_at: string;
  is_author?: boolean; replies?: FeedComment[];
};
export type FeedPost = {
  post_id: string; title: string; body: string;
  subject: string; topic: string; exam_level: string; question_type: string;
  media: FeedMedia[]; author: FeedAuthor;
  like_count: number; comment_count: number; share_count: number;
  view_count: number;
  ai_answer?: string | null; ai_citations?: FeedCitation[];
  ai_status: "none" | "pending" | "generating" | "ready" | "unavailable" | "error";
  ai_error?: string;
  created_at: string; liked?: boolean; saved?: boolean;
};

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ------------------------------------------------------------
// AI answer block: ready answer + citations, or a clear retry state.
// ------------------------------------------------------------
function AiAnswerBlock({ post, onRetry }: {
  post: FeedPost; onRetry: (postId: string) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  if (!post.ai_status || post.ai_status === "none") return null;

  if (post.ai_status === "pending" || post.ai_status === "generating") {
    return (
      <View style={styles.aiBox}>
        <ActivityIndicator size="small" color={t.brandPrimary} />
        <Text style={styles.aiMuted}>GC AI is preparing an explanation…</Text>
      </View>
    );
  }
  if (post.ai_status === "unavailable" || post.ai_status === "error") {
    return (
      <View style={styles.aiBox}>
        <Ionicons name="cloud-offline-outline" size={18} color={t.warning} />
        <Text style={styles.aiMuted}>
          The GCSharp model is unavailable right now.
        </Text>
        <Pressable style={styles.retryBtn} onPress={() => onRetry(post.post_id)}>
          <Ionicons name="refresh" size={14} color="#fff" />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.aiBox}>
      <View style={styles.aiHeader}>
        <Ionicons name="sparkles" size={14} color={t.brandPrimary} />
        <Text style={styles.aiBadge}>GC AI explanation</Text>
      </View>
      <Text style={styles.aiAnswer}>{post.ai_answer}</Text>
      {(post.ai_citations?.length ?? 0) > 0 && (
        <View style={styles.cites}>
          <Text style={styles.citesLabel}>Sources:</Text>
          {post.ai_citations!.map((c, i) => (
            <Pressable key={`${c.url}-${i}`}
              onPress={() => Linking.openURL(c.url).catch(() => {})}
              style={styles.citeRow}>
              <Ionicons name="link-outline" size={12} color={t.brandPrimary} />
              <Text style={styles.citeText} numberOfLines={1}>
                {c.title || c.url}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}


// ------------------------------------------------------------
// Post card: author, content, media, actions, AI answer.
// ------------------------------------------------------------
function PostCard({ post, onToggleLike, onToggleSave, onShare, onRetryAi,
                    onOpen }: {
  post: FeedPost;
  onToggleLike: (p: FeedPost) => void;
  onToggleSave: (p: FeedPost) => void;
  onShare: (p: FeedPost) => void;
  onRetryAi: (postId: string) => void;
  onOpen: (p: FeedPost) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const images = post.media?.filter((m) => m.type === "image") ?? [];
  const videos = post.media?.filter((m) => m.type === "video") ?? [];

  return (
    <Pressable style={styles.card} onPress={() => onOpen(post)}>
      {/* author row */}
      <View style={styles.authorRow}>
        {post.author?.profile_photo ? (
          <Image source={{ uri: post.author.profile_photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={16} color="#fff" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName} numberOfLines={1}>
            {post.author?.full_name || "Student"}
          </Text>
          <Text style={styles.meta}>
            {timeAgo(post.created_at)} · {post.exam_level || "General"}
          </Text>
        </View>
        <View style={styles.typeChip}>
          <Text style={styles.typeChipText}>{post.question_type}</Text>
        </View>
      </View>

      {post.title ? <Text style={styles.title} numberOfLines={3}>{post.title}</Text> : null}
      {post.body ? <Text style={styles.body} numberOfLines={6}>{post.body}</Text> : null}

      {/* image grid */}
      {images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.mediaRow} contentContainerStyle={{ gap: 8 }}>
          {images.map((m, i) => (
            <Image key={`${m.url}-${i}`} source={{ uri: m.url }}
              style={styles.mediaImage} resizeMode="cover" />
          ))}
        </ScrollView>
      )}
      {/* videos */}
      {videos.map((m, i) => (
        <Pressable key={`${m.url}-${i}`} style={styles.videoRow}
          onPress={() => Linking.openURL(m.url).catch(() => {})}>
          <Ionicons name="play-circle" size={22} color={t.brandPrimary} />
          <Text style={styles.videoText} numberOfLines={1}>
            {m.name || "Short video"} — tap to play
          </Text>
        </Pressable>
      ))}

      {/* subject / topic tags */}
      <View style={styles.tags}>
        {!!post.subject && (
          <View style={styles.tag}><Text style={styles.tagText}>{post.subject}</Text></View>
        )}
        {!!post.topic && (
          <View style={styles.tag}><Text style={styles.tagText}>{post.topic}</Text></View>
        )}
      </View>

      <AiAnswerBlock post={post} onRetry={onRetryAi} />

      {/* actions */}
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => onToggleLike(post)} hitSlop={6}>
          <Ionicons name={post.liked ? "heart" : "heart-outline"} size={18}
            color={post.liked ? t.error : t.onSurfaceMuted} />
          <Text style={styles.actionText}>{post.like_count || 0}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => onOpen(post)} hitSlop={6}>
          <Ionicons name="chatbubble-outline" size={17} color={t.onSurfaceMuted} />
          <Text style={styles.actionText}>{post.comment_count || 0}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => onShare(post)} hitSlop={6}>
          <Ionicons name="share-social-outline" size={17} color={t.onSurfaceMuted} />
          <Text style={styles.actionText}>{post.share_count || 0}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.action} onPress={() => onToggleSave(post)} hitSlop={6}>
          <Ionicons name={post.saved ? "bookmark" : "bookmark-outline"} size={17}
            color={post.saved ? t.brandPrimary : t.onSurfaceMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
}


// ------------------------------------------------------------
// Screen
// ------------------------------------------------------------
export default function LearningFeedScreen() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const router = useRouter();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sort, setSort] = useState<"recent" | "top">("recent");
  const [subject, setSubject] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    try {
      setError(null);
      const params = new URLSearchParams({ limit: "20", sort });
      if (subject) params.set("subject", subject);
      if (!opts?.refresh && cursor) params.set("cursor", cursor);
      const data = await api<{ items: FeedPost[]; next_cursor: string | null; has_more: boolean }>(
        `/feed/posts?${params.toString()}`);
      setPosts((prev) =>
        opts?.refresh ? data.items : [...prev, ...data.items]);
      setHasMore(!!data.has_more);
      setCursor(data.next_cursor ?? null);
    } catch (e: any) {
      setError(e?.message || "Could not load the feed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [sort, subject, cursor]);

  // initial load + reload when filters change
  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setCursor(null);
    load({ refresh: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, subject]);

  // facets for the subject filter chips
  useEffect(() => {
    api<{ subjects: string[] }>("/feed/facets")
      .then((f) => setSubjects((f.subjects || []).slice(0, 12)))
      .catch(() => {});
  }, []);

  // poll pending/generating AI answers so the explanation appears when ready
  useEffect(() => {
    const needsPoll = posts.some(
      (p) => p.ai_status === "pending" || p.ai_status === "generating");
    if (!needsPoll) return;
    const timer = setTimeout(() => load({ refresh: true }), 6000);
    return () => clearTimeout(timer);
  }, [posts, load]);

  // real-time: refresh when someone posts or comments
  const onSocketEvent = useCallback((e: any) => {
    if (e?.type === "feed:new_post" || e?.type === "feed:new_comment") {
      load({ refresh: true });
    }
  }, [load]);
  const { connected } = useLearningSocket(onSocketEvent);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setCursor(null);
    load({ refresh: true });
  }, [load]);

  const patchPost = (postId: string, patch: Partial<FeedPost>) =>
    setPosts((prev) => prev.map((p) => (p.post_id === postId ? { ...p, ...patch } : p)));

  const toggleLike = useCallback(async (p: FeedPost) => {
    const liked = !p.liked;
    patchPost(p.post_id, { liked, like_count: (p.like_count || 0) + (liked ? 1 : -1) });
    try {
      const r = await api<{ active: boolean; count: number }>(
        `/feed/posts/${p.post_id}/like`, { method: "POST" });
      patchPost(p.post_id, { liked: r.active, like_count: r.count });
    } catch {
      patchPost(p.post_id, { liked: p.liked, like_count: p.like_count });
    }
  }, []);

  const toggleSave = useCallback(async (p: FeedPost) => {
    const saved = !p.saved;
    patchPost(p.post_id, { saved });
    try {
      await api(`/feed/posts/${p.post_id}/save`, { method: "POST" });
    } catch {
      patchPost(p.post_id, { saved: p.saved });
    }
  }, []);

  const sharePost = useCallback(async (p: FeedPost) => {
    try {
      const r = await api<{ share_count: number }>(
        `/feed/posts/${p.post_id}/share`, { method: "POST" });
      patchPost(p.post_id, { share_count: r.share_count });
    } catch {}
  }, []);

  const retryAi = useCallback(async (postId: string) => {
    patchPost(postId, { ai_status: "generating" });
    try {
      await api(`/feed/posts/${postId}/ai/retry`, { method: "POST" });
      setTimeout(() => load({ refresh: true }), 5000);
    } catch {
      patchPost(postId, { ai_status: "unavailable" });
    }
  }, [load]);

  const renderItem = useCallback(({ item }: { item: FeedPost }) => (
    <PostCard post={item} onToggleLike={toggleLike} onToggleSave={toggleSave}
      onShare={sharePost} onRetryAi={retryAi}
      onOpen={(p) => router.push(`/feed/${p.post_id}` as any)} />
  ), [toggleLike, toggleSave, sharePost, retryAi, router]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Learning Feed</Text>
          <Text style={styles.headerSub}>
            {connected ? "● Live" : "○ Reconnecting…"}
          </Text>
        </View>
        <Pressable style={styles.composeBtn}
          onPress={() => router.push("/feed/compose" as any)} testID="feed-compose">
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* filters */}
      <View style={styles.filters}>
        <Pressable
          style={[styles.sortChip, sort === "recent" && styles.sortChipActive]}
          onPress={() => setSort("recent")}>
          <Text style={[styles.sortChipText, sort === "recent" && styles.sortChipTextActive]}>
            Recent
          </Text>
        </Pressable>
        <Pressable
          style={[styles.sortChip, sort === "top" && styles.sortChipActive]}
          onPress={() => setSort("top")}>
          <Text style={[styles.sortChipText, sort === "top" && styles.sortChipTextActive]}>
            Top
          </Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingLeft: 8 }}>
          <Pressable
            style={[styles.subjectChip, !subject && styles.subjectChipActive]}
            onPress={() => setSubject(null)}>
            <Text style={[styles.subjectChipText, !subject && styles.subjectChipTextActive]}>
              All
            </Text>
          </Pressable>
          {subjects.map((s) => (
            <Pressable key={s}
              style={[styles.subjectChip, subject === s && styles.subjectChipActive]}
              onPress={() => setSubject(subject === s ? null : s)}>
              <Text style={[styles.subjectChipText,
                subject === s && styles.subjectChipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* states */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.brandPrimary} />
        </View>
      ) : error && posts.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={t.onSurfaceMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.post_id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md,
            paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={t.brandPrimary} /> }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!loadingMore && hasMore) {
              setLoadingMore(true);
              load();
            }
          }}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={t.brandPrimary} />
          ) : null}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.center}>
                <Ionicons name="newspaper-outline" size={40} color={t.onSurfaceMuted} />
                <Text style={styles.errorText}>
                  No posts yet. Be the first to ask a question!
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}


const createStyles = (t: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: t.onSurface },
  headerSub: { fontSize: 12, color: t.onSurfaceMuted, marginTop: 2 },
  composeBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: t.brandPrimary,
    alignItems: "center", justifyContent: "center", ...shadow1,
  },
  filters: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  sortChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
    backgroundColor: t.surfaceSecondary, borderWidth: 1, borderColor: t.border,
  },
  sortChipActive: { backgroundColor: t.brandPrimary, borderColor: t.brandPrimary },
  sortChipText: { fontSize: 12, color: t.onSurfaceMuted, fontWeight: "600" },
  sortChipTextActive: { color: "#fff" },
  subjectChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
    backgroundColor: t.surfaceSecondary, borderWidth: 1, borderColor: t.border,
  },
  subjectChipActive: { backgroundColor: t.brandTertiary, borderColor: t.brandPrimary },
  subjectChipText: { fontSize: 12, color: t.onSurfaceMuted },
  subjectChipTextActive: { color: t.onBrandTertiary, fontWeight: "700" },
  card: {
    backgroundColor: t.surfaceSecondary, borderRadius: radii.md,
    padding: spacing.md, ...shadow1,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: {
    backgroundColor: t.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  authorName: { fontSize: 14, fontWeight: "700", color: t.onSurface },
  meta: { fontSize: 11, color: t.onSurfaceMuted },
  typeChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
    backgroundColor: t.surfaceTertiary,
  },
  typeChipText: { fontSize: 10, color: t.onSurfaceMuted, fontWeight: "600" },
  title: { fontSize: 16, fontWeight: "700", color: t.onSurface, marginTop: 10 },
  body: { fontSize: 14, color: t.onSurface, marginTop: 6, lineHeight: 20 },
  mediaRow: { marginTop: 10 },
  mediaImage: { width: 200, height: 140, borderRadius: radii.sm },
  videoRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10,
    backgroundColor: t.surfaceTertiary, borderRadius: radii.sm, padding: 10,
  },
  videoText: { flex: 1, fontSize: 13, color: t.onSurface },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
    backgroundColor: t.brandTertiary,
  },
  tagText: { fontSize: 10, color: t.onBrandTertiary, fontWeight: "600" },
  aiBox: {
    marginTop: 12, padding: 12, borderRadius: radii.sm,
    backgroundColor: t.surfaceTertiary, gap: 6,
  },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiBadge: { fontSize: 12, fontWeight: "700", color: t.brandPrimary },
  aiAnswer: { fontSize: 13, color: t.onSurface, lineHeight: 19 },
  aiMuted: { fontSize: 12, color: t.onSurfaceMuted, flex: 1 },
  cites: { marginTop: 6, gap: 4 },
  citesLabel: { fontSize: 11, fontWeight: "700", color: t.onSurfaceMuted },
  citeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  citeText: { fontSize: 12, color: t.brandPrimary, flex: 1 },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: t.brandPrimary, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radii.pill,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  actions: {
    flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: t.divider,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 12, color: t.onSurfaceMuted },
  center: { alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  errorText: { fontSize: 13, color: t.onSurfaceMuted, textAlign: "center" },
});



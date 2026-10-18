/**
 * Learning Feed tab — modern redesign.
 *
 * Design notes:
 *  - Flat, airy cards (hairline border, large radius, no heavy shadow).
 *  - One row of underline tabs for status, one quiet row of exam-level chips.
 *  - Slim composer: avatar + prompt, three quick actions below.
 *  - The AI answer is the one tinted block per card; sources are swipeable pills.
 *  - Floating "Ask" pill instead of a bare "+" button.
 *  - All data/socket/filter logic is unchanged.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, RefreshControl,
  ActivityIndicator, Image, Linking, ScrollView, TextInput, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme-context";
import { radii, spacing, shadow1, type Palette } from "@/src/theme";
import { api } from "@/src/api";
import { useLearningSocket } from "@/src/hooks/useLearningSocket";
import { useAuth } from "@/src/auth";
import { GlobalAppHeader } from "@/src/components/GlobalAppHeader";

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

type QuickFilter = "all" | "verified" | "unanswered" | "video";

const AI_COLLAPSE_CHARS = 320;
const BODY_COLLAPSE_CHARS = 220;
const CARD_RADIUS = 20;
const INNER_RADIUS = 14;

const EXAM_LEVELS = [
  { label: "A-Level", value: "GCE A Level" },
  { label: "O-Level", value: "GCE O Level" },
  { label: "HND", value: "HND" },
  { label: "Concours", value: "Concours" },
];

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

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// ------------------------------------------------------------
// Small pieces
// ------------------------------------------------------------
function ShowMore({ expanded, onPress }: { expanded: boolean; onPress: () => void }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Text style={styles.showMore}>{expanded ? "Show less" : "Show more"}</Text>
    </Pressable>
  );
}

function SkeletonCard() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View style={styles.card}>
      <View style={styles.authorRow}>
        <View style={[styles.avatar, styles.skel]} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[styles.skel, { height: 12, width: "45%" }]} />
          <View style={[styles.skel, { height: 10, width: "25%" }]} />
        </View>
      </View>
      <View style={[styles.skel, { height: 16, width: "85%", marginTop: 16 }]} />
      <View style={[styles.skel, { height: 12, width: "100%", marginTop: 10 }]} />
      <View style={[styles.skel, { height: 12, width: "70%", marginTop: 6 }]} />
      <View style={[styles.skel, {
        height: 140, width: "100%", marginTop: 16, borderRadius: INNER_RADIUS,
      }]} />
    </View>
  );
}

function FeedComposer({ onAction }: {
  onAction: (action: "paper" | "video" | "ai") => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const { user } = useAuth();
  const firstName = user?.full_name?.split(/\s+/)[0] || "there";
  const avatar = user?.local_photo_uri || user?.profile_photo;
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <View style={styles.composerCard}>
      <Pressable style={styles.composerPrompt} onPress={() => onAction("paper")}
        accessibilityRole="button" accessibilityLabel="Ask a question">
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.composerAvatar} />
        ) : (
          <View style={[styles.composerAvatar, styles.composerAvatarFallback]}>
            <Text style={styles.composerInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.composerInput}>
          <Text style={styles.composerInputText} numberOfLines={1}>
            What are you stuck on, {firstName}?
          </Text>
        </View>
      </Pressable>
      <View style={styles.composerActions}>
        <Pressable style={styles.composerAction} onPress={() => onAction("paper")}
          accessibilityRole="button">
          <Ionicons name="camera" size={18} color={t.brandPrimary} />
          <Text style={styles.composerActionText}>Snap paper</Text>
        </Pressable>
        <Pressable style={styles.composerAction} onPress={() => onAction("video")}
          accessibilityRole="button">
          <Ionicons name="videocam" size={18} color={t.brandPrimary} />
          <Text style={styles.composerActionText}>Video</Text>
        </Pressable>
        <Pressable style={[styles.composerAction, styles.composerActionAi]}
          onPress={() => onAction("ai")} accessibilityRole="button">
          <Ionicons name="sparkles" size={17} color="#fff" />
          <Text style={[styles.composerActionText, { color: "#fff" }]}>AI tutor</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ------------------------------------------------------------
// AI answer block
// ------------------------------------------------------------
function AiAnswerBlock({ post, onRetry }: {
  post: FeedPost; onRetry: (postId: string) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [expanded, setExpanded] = useState(false);
  if (!post.ai_status || post.ai_status === "none") return null;

  if (post.ai_status === "pending" || post.ai_status === "generating") {
    return (
      <View style={[styles.aiStatus]}>
        <ActivityIndicator size="small" color={t.brandPrimary} />
        <Text style={styles.aiMuted}>GCSharp AI is writing an explanation…</Text>
      </View>
    );
  }
  if (post.ai_status === "unavailable" || post.ai_status === "error") {
    return (
      <View style={styles.aiStatus}>
        <Ionicons name="cloud-offline-outline" size={20} color={t.warning} />
        <Text style={styles.aiMuted}>The AI tutor is unavailable right now.</Text>
        <Pressable style={styles.retryBtn} onPress={() => onRetry(post.post_id)}
          accessibilityRole="button" accessibilityLabel="Retry AI explanation">
          <Ionicons name="refresh" size={14} color="#fff" />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const answer = post.ai_answer || "";
  const long = answer.length > AI_COLLAPSE_CHARS;
  const cites = post.ai_citations ?? [];

  return (
    <View style={styles.aiBox}>
      <View style={styles.aiHeader}>
        <View style={styles.aiIcon}>
          <Ionicons name="sparkles" size={13} color="#fff" />
        </View>
        <Text style={styles.aiBadge}>GCSharp AI</Text>
      </View>
      <Text style={styles.aiAnswer} numberOfLines={long && !expanded ? 7 : undefined}>
        {answer}
      </Text>
      {long && <ShowMore expanded={expanded} onPress={() => setExpanded((v) => !v)} />}
      {cites.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cites}>
          {cites.map((c, i) => (
            <Pressable key={`${c.url}-${i}`}
              onPress={() => Linking.openURL(c.url).catch(() => { })}
              style={styles.citePill} accessibilityRole="link"
              accessibilityLabel={`Source ${i + 1}: ${c.title || hostOf(c.url)}`}>
              <View style={styles.citeNum}>
                <Text style={styles.citeNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.citeText} numberOfLines={1}>
                {c.title || hostOf(c.url)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ------------------------------------------------------------
// Media
// ------------------------------------------------------------
function MediaBlock({ media, cardWidth }: { media: FeedMedia[]; cardWidth: number }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [index, setIndex] = useState(0);
  const images = media.filter((m) => m.type === "image");
  const videos = media.filter((m) => m.type === "video");
  const h = cardWidth * 0.6;

  return (
    <>
      {images.length === 1 && (
        <Image source={{ uri: images[0].url }}
          style={[styles.mediaSingle, { width: cardWidth, height: h }]}
          resizeMode="cover" accessibilityLabel={images[0].name || "Attached image"} />
      )}
      {images.length > 1 && (
        <View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            style={styles.mediaScroll}
            onMomentumScrollEnd={(e) =>
              setIndex(Math.round(e.nativeEvent.contentOffset.x / cardWidth))}>
            {images.map((m, i) => (
              <Image key={`${m.url}-${i}`} source={{ uri: m.url }}
                style={{ width: cardWidth, height: h }}
                resizeMode="cover" accessibilityLabel={m.name || `Image ${i + 1}`} />
            ))}
          </ScrollView>
          <View style={styles.mediaCounter}>
            <Text style={styles.mediaCounterText}>{index + 1}/{images.length}</Text>
          </View>
        </View>
      )}
      {videos.map((m, i) => (
        <Pressable key={`${m.url}-${i}`} style={styles.videoRow}
          onPress={() => Linking.openURL(m.url).catch(() => { })}
          accessibilityRole="button" accessibilityLabel="Play video">
          <View style={styles.videoPlay}>
            <Ionicons name="play" size={22} color="#fff" />
          </View>
          <Text style={styles.videoLabel} numberOfLines={1}>
            {m.name || "Video walkthrough"}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

// ------------------------------------------------------------
// Post card
// ------------------------------------------------------------
function PostCard({ post, cardWidth, onToggleLike, onToggleSave, onShare,
  onRetryAi, onOpen }: {
    post: FeedPost;
    cardWidth: number;
    onToggleLike: (p: FeedPost) => void;
    onToggleSave: (p: FeedPost) => void;
    onShare: (p: FeedPost) => void;
    onRetryAi: (postId: string) => void;
    onOpen: (p: FeedPost) => void;
  }) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [bodyOpen, setBodyOpen] = useState(false);
  const hasMedia = (post.media?.length ?? 0) > 0;
  const bodyLong = (post.body?.length ?? 0) > BODY_COLLAPSE_CHARS;

  return (
    <View style={styles.card}>
      <Pressable onPress={() => onOpen(post)} accessibilityRole="button"
        accessibilityLabel={`Open question: ${post.title || "Untitled"}`}>
        <View style={styles.authorRow}>
          {post.author?.profile_photo ? (
            <Image source={{ uri: post.author.profile_photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {(post.author?.full_name || "S").trim().charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.authorName} numberOfLines={1}>
              {post.author?.full_name || "Student"}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>{timeAgo(post.created_at)}</Text>
          </View>
          {!!(post.exam_level || post.question_type) && (
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText}>{post.exam_level || post.question_type}</Text>
            </View>
          )}
        </View>

        {post.title ? <Text style={styles.title} numberOfLines={3}>{post.title}</Text> : null}
        {post.body ? (
          <Text style={styles.body} numberOfLines={bodyLong && !bodyOpen ? 5 : undefined}>
            {post.body}
          </Text>
        ) : null}
      </Pressable>
      {bodyLong && <ShowMore expanded={bodyOpen} onPress={() => setBodyOpen((v) => !v)} />}

      {hasMedia && (
        <View style={styles.mediaWrap}>
          <MediaBlock media={post.media} cardWidth={cardWidth} />
        </View>
      )}

      {(!!post.subject || !!post.topic) && (
        <View style={styles.tags}>
          {!!post.subject && (
            <View style={styles.tag}><Text style={styles.tagText}>{post.subject}</Text></View>
          )}
          {!!post.topic && (
            <View style={styles.tagOutline}>
              <Text style={styles.tagOutlineText}>{post.topic}</Text>
            </View>
          )}
        </View>
      )}

      <AiAnswerBlock post={post} onRetry={onRetryAi} />

      <View style={styles.actions}>
        <Pressable style={[styles.action, post.liked && styles.actionLiked]}
          onPress={() => onToggleLike(post)} hitSlop={6}
          accessibilityRole="button" accessibilityLabel={post.liked ? "Unlike" : "Like"}>
          <Ionicons name={post.liked ? "heart" : "heart-outline"} size={18}
            color={post.liked ? t.error : t.onSurfaceMuted} />
          <Text style={[styles.actionText, post.liked && { color: t.error }]}>
            {post.like_count || 0}
          </Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => onOpen(post)} hitSlop={6}
          accessibilityRole="button" accessibilityLabel="Open comments">
          <Ionicons name="chatbubble-outline" size={17} color={t.onSurfaceMuted} />
          <Text style={styles.actionText}>{post.comment_count || 0}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => onShare(post)} hitSlop={6}
          accessibilityRole="button" accessibilityLabel="Share">
          <Ionicons name="share-social-outline" size={17} color={t.onSurfaceMuted} />
          <Text style={styles.actionText}>{post.share_count || 0}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.saveBtn} onPress={() => onToggleSave(post)} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={post.saved ? "Remove bookmark" : "Save"}>
          <Ionicons name={post.saved ? "bookmark" : "bookmark-outline"} size={20}
            color={post.saved ? t.brandPrimary : t.onSurfaceMuted} />
        </Pressable>
      </View>
    </View>
  );
}

// ------------------------------------------------------------
// Screen
// ------------------------------------------------------------
export default function LearningFeedScreen() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const router = useRouter();
  const { width } = useWindowDimensions();
  // screen width minus list padding (both sides) minus card padding (both sides)
  const cardWidth = width - spacing.md * 2 - spacing.md * 2;

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sort, setSort] = useState<"recent" | "top">("recent");
  const [subject, setSubject] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [examLevelFilter, setExamLevelFilter] = useState("");
  const [questionTypeFilter, setQuestionTypeFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const loadRequestId = useRef(0);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    const requestId = ++loadRequestId.current;
    try {
      setError(null);
      const params = new URLSearchParams({ limit: "20", sort });
      if (subject) params.set("subject", subject);
      if (searchQuery) params.set("q", searchQuery);
      if (topicFilter.trim()) params.set("topic", topicFilter.trim());
      if (examLevelFilter) params.set("exam_level", examLevelFilter);
      if (questionTypeFilter) params.set("question_type", questionTypeFilter);
      if (!opts?.refresh && cursor) params.set("cursor", cursor);
      const data = await api<{ items: FeedPost[]; next_cursor: string | null; has_more: boolean }>(
        `/feed/posts?${params.toString()}`);
      if (requestId !== loadRequestId.current) return;
      setPosts((prev) =>
        opts?.refresh ? data.items : [...prev, ...data.items]);
      setHasMore(!!data.has_more);
      setCursor(data.next_cursor ?? null);
    } catch (e: any) {
      if (requestId === loadRequestId.current) {
        setError(e?.message || "Could not load the feed.");
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [sort, subject, searchQuery, topicFilter, examLevelFilter,
    questionTypeFilter, cursor]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // initial load + reload when filters change
  useEffect(() => {
    const timer = setTimeout(() => load({ refresh: true }), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, subject, searchQuery, topicFilter, examLevelFilter,
    questionTypeFilter]);

  // facets for the subject filter chips
  useEffect(() => {
    api<{ subjects: string[] }>("/feed/facets")
      .then((f) => setSubjects((f.subjects || []).slice(0, 12)))
      .catch(() => { });
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
    if (["feed:new_post", "feed:new_comment", "feed:media_updated",
      "ai_answer", "video_ready"].includes(e?.type)) {
      load({ refresh: true });
    }
  }, [load]);
  const { connected } = useLearningSocket(onSocketEvent);

  const filteredPosts = useMemo(() => posts.filter((post) => {
    if (quickFilter === "verified") {
      return post.ai_status === "ready" && (post.ai_citations?.length || 0) > 0;
    }
    if (quickFilter === "unanswered") return !post.ai_answer;
    if (quickFilter === "video") return post.media?.some((media) => media.type === "video");
    return true;
  }), [posts, quickFilter]);

  const unansweredCount = useMemo(
    () => posts.filter((post) => !post.ai_answer).length, [posts]);

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
    } catch { }
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

  const openCompose = useCallback(() => router.push("/feed/compose" as any), [router]);

  const renderItem = useCallback(({ item }: { item: FeedPost }) => (
    <PostCard post={item} cardWidth={cardWidth}
      onToggleLike={toggleLike} onToggleSave={toggleSave}
      onShare={sharePost} onRetryAi={retryAi}
      onOpen={(p) => router.push(`/feed/${p.post_id}` as any)} />
  ), [cardWidth, toggleLike, toggleSave, sharePost, retryAi, router]);

  const advancedFilterCount =
    (subject ? 1 : 0) + (topicFilter.trim() ? 1 : 0) + (questionTypeFilter ? 1 : 0) +
    (sort !== "recent" ? 1 : 0);
  const emptyForFilter = !!(subject || searchQuery || topicFilter.trim() ||
    examLevelFilter || questionTypeFilter || quickFilter !== "all");
  const clearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setSubject(null);
    setTopicFilter("");
    setExamLevelFilter("");
    setQuestionTypeFilter("");
    setQuickFilter("all");
    setSort("recent");
  };

  const tabs: { key: QuickFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "verified", label: "AI verified" },
    { key: "unanswered", label: unansweredCount > 0 ? `Unanswered · ${unansweredCount}` : "Unanswered" },
    { key: "video", label: "Videos" },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <GlobalAppHeader
        statusLabel={connected ? "Live" : "Reconnecting"}
        isLive={connected}
        onSearchPress={() => setSearchOpen((open) => !open)}
      />

      {/* status tabs + filter button */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow} style={{ flex: 1 }}>
          {tabs.map(({ key, label }) => {
            const active = quickFilter === key;
            return (
              <Pressable key={key} onPress={() => setQuickFilter(key)}
                style={styles.tab} accessibilityRole="tab"
                accessibilityState={{ selected: active }}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
                <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable style={styles.filterToggle}
          onPress={() => setFiltersOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={filtersOpen ? "Hide filters" : "Show filters"}>
          <Ionicons name="options-outline" size={20}
            color={filtersOpen ? t.brandPrimary : t.onSurface} />
          {advancedFilterCount > 0 && <View style={styles.filterDot} />}
        </Pressable>
      </View>

      {/* exam level chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow} style={styles.chipScroll}>
        <Pressable
          style={[styles.chip, !examLevelFilter && styles.chipActive]}
          onPress={() => setExamLevelFilter("")}>
          <Text style={[styles.chipText, !examLevelFilter && styles.chipTextActive]}>
            All levels
          </Text>
        </Pressable>
        {EXAM_LEVELS.map(({ label, value }) => {
          const active = examLevelFilter === value;
          return (
            <Pressable key={value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setExamLevelFilter(active ? "" : value)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {searchOpen && (
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={t.onSurfaceMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search questions and explanations"
              placeholderTextColor={t.onSurfaceMuted}
              value={searchInput}
              onChangeText={setSearchInput}
              returnKeyType="search"
              autoFocus
              accessibilityLabel="Search learning feed"
            />
            {!!searchInput && (
              <Pressable onPress={() => setSearchInput("")} hitSlop={8}
                accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={t.onSurfaceMuted} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {filtersOpen && (
        <View style={styles.filterPanel}>
          <TextInput
            style={styles.filterInput}
            placeholder="Filter by topic"
            placeholderTextColor={t.onSurfaceMuted}
            value={topicFilter}
            onChangeText={setTopicFilter}
            maxLength={120}
            returnKeyType="search"
            accessibilityLabel="Filter by topic"
          />
          <Text style={styles.filterLabel}>Post type</Text>
          <View style={styles.filterChips}>
            {[
              ["", "All types"], ["question", "Question"], ["concept", "Concept"],
              ["past_paper", "Past paper"], ["discussion", "Discussion"], ["note", "Note"],
            ].map(([value, label]) => (
              <Pressable key={value || "all-types"}
                style={[styles.filterChip, questionTypeFilter === value && styles.filterChipActive]}
                onPress={() => setQuestionTypeFilter(value)}>
                <Text style={[styles.filterChipText,
                questionTypeFilter === value && styles.filterChipTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.filterLabel}>Subject</Text>
          <View style={styles.filterChips}>
            <Pressable
              style={[styles.filterChip, !subject && styles.filterChipActive]}
              onPress={() => setSubject(null)}>
              <Text style={[styles.filterChipText, !subject && styles.filterChipTextActive]}>
                All subjects
              </Text>
            </Pressable>
            {subjects.map((value) => (
              <Pressable key={value}
                style={[styles.filterChip, subject === value && styles.filterChipActive]}
                onPress={() => setSubject(subject === value ? null : value)}>
                <Text style={[styles.filterChipText,
                subject === value && styles.filterChipTextActive]}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.filterLabel}>Sort by</Text>
          <View style={styles.filterChips}>
            {(["recent", "top"] as const).map((value) => (
              <Pressable key={value}
                style={[styles.filterChip, sort === value && styles.filterChipActive]}
                onPress={() => setSort(value)}>
                <Text style={[styles.filterChipText, sort === value && styles.filterChipTextActive]}>
                  {value === "recent" ? "Recent" : "Top"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.clearFilters} onPress={clearFilters}>
            <Text style={styles.clearFiltersText}>Clear all filters</Text>
          </Pressable>
        </View>
      )}

      {!!error && posts.length > 0 && (
        <Pressable style={styles.banner} onPress={onRefresh} accessibilityRole="button">
          <Ionicons name="alert-circle-outline" size={16} color={t.warning} />
          <Text style={styles.bannerText} numberOfLines={1}>
            Couldn&apos;t update the feed. Tap to retry.
          </Text>
        </Pressable>
      )}

      {loading ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : error && posts.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={t.onSurfaceMuted} />
          <Text style={styles.emptyTitle}>Couldn&apos;t load the feed</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredPosts}
          keyExtractor={(item) => item.post_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <FeedComposer
              onAction={(action) => {
                if (action === "ai") router.push("/(tabs)/ai");
                else if (action === "video") router.push({ pathname: "/feed/compose", params: { mediaType: "video" } });
                else router.push({ pathname: "/feed/compose", params: { paperScan: "true" } });
              }}
            />
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={t.brandPrimary} />}
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
                <Text style={styles.emptyTitle}>
                  {emptyForFilter ? "No questions match these filters" : "No questions yet"}
                </Text>
                <Text style={styles.errorText}>
                  {emptyForFilter
                    ? "Try removing a filter to see more questions."
                    : "Post a question with a photo or short video and GCSharp AI will explain it."}
                </Text>
                {emptyForFilter ? (
                  <Pressable style={styles.retryBtn} onPress={clearFilters}>
                    <Text style={styles.retryText}>Clear filters</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.retryBtn} onPress={openCompose}>
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.retryText}>Ask a question</Text>
                  </Pressable>
                )}
              </View>
            ) : null
          }
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={openCompose}
        testID="feed-compose"
        accessibilityRole="button"
        accessibilityLabel="Create a learning post">
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Ask</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const createStyles = (t: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.surface },

  // tabs
  tabBar: {
    flexDirection: "row", alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.divider,
  },
  tabRow: { paddingLeft: spacing.md, gap: 22 },
  tab: { paddingTop: 12, alignItems: "center" },
  tabText: { fontSize: 14, fontWeight: "600", color: t.onSurfaceMuted, paddingBottom: 10 },
  tabTextActive: { color: t.onSurface, fontWeight: "800" },
  tabUnderline: { height: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: "transparent" },
  tabUnderlineActive: { backgroundColor: t.brandPrimary },
  filterToggle: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    marginRight: spacing.sm,
  },
  filterDot: {
    position: "absolute", top: 10, right: 10, width: 8, height: 8,
    borderRadius: 4, backgroundColor: t.brandPrimary,
  },

  // exam-level chips
  chipScroll: { flexGrow: 0 },
  chipRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 12 },
  chip: {
    height: 32, paddingHorizontal: 14, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: t.surfaceSecondary,
    borderWidth: 1, borderColor: t.border,
  },
  chipActive: { backgroundColor: t.brandPrimary, borderColor: t.brandPrimary },
  chipText: { fontSize: 13, fontWeight: "600", color: t.onSurface },
  chipTextActive: { color: "#fff" },

  // search + filter panel
  searchRow: { marginHorizontal: spacing.md, marginBottom: 8 },
  searchBox: {
    minHeight: 46, flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, borderRadius: radii.pill,
    backgroundColor: t.surfaceSecondary, borderWidth: 1, borderColor: t.border,
  },
  searchInput: { flex: 1, minHeight: 44, paddingVertical: 0, color: t.onSurface, fontSize: 15 },
  filterPanel: {
    marginHorizontal: spacing.md, marginBottom: 8, padding: 14, gap: 10,
    borderRadius: INNER_RADIUS, backgroundColor: t.surfaceSecondary,
    borderWidth: 1, borderColor: t.border,
  },
  filterInput: {
    minHeight: 44, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: t.border, color: t.onSurface, fontSize: 14,
  },
  filterLabel: { fontSize: 13, fontWeight: "700", color: t.onSurfaceMuted },
  filterChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill,
    borderWidth: 1, borderColor: t.border, backgroundColor: t.surface,
  },
  filterChipActive: { borderColor: t.brandPrimary, backgroundColor: t.brandPrimary },
  filterChipText: { fontSize: 13, color: t.onSurface },
  filterChipTextActive: { color: "#fff", fontWeight: "700" },
  clearFilters: { alignSelf: "flex-end", paddingVertical: 4 },
  clearFiltersText: { fontSize: 13, color: t.brandPrimary, fontWeight: "700" },

  banner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: spacing.md, marginBottom: 8, paddingHorizontal: 12,
    paddingVertical: 10, borderRadius: 12, backgroundColor: t.surfaceTertiary,
  },
  bannerText: { flex: 1, fontSize: 13, color: t.onSurface },

  list: { padding: spacing.md, gap: 14, paddingBottom: 130 },

  // composer
  composerCard: {
    padding: 14, borderRadius: CARD_RADIUS, gap: 12,
    backgroundColor: t.surfaceSecondary,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
  },
  composerPrompt: { flexDirection: "row", alignItems: "center", gap: 12 },
  composerAvatar: { width: 40, height: 40, borderRadius: 20 },
  composerAvatarFallback: {
    alignItems: "center", justifyContent: "center", backgroundColor: t.brandPrimary,
  },
  composerInitial: { color: "#fff", fontSize: 16, fontWeight: "700" },
  composerInput: {
    flex: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: 16,
    borderRadius: radii.pill, backgroundColor: t.surface,
    borderWidth: 1, borderColor: t.border,
  },
  composerInputText: { color: t.onSurfaceMuted, fontSize: 14 },
  composerActions: { flexDirection: "row", gap: 8 },
  composerAction: {
    flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6, borderRadius: radii.pill,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  composerActionAi: { backgroundColor: t.brandPrimary, borderColor: t.brandPrimary },
  composerActionText: { color: t.onSurface, fontSize: 13, fontWeight: "700" },

  // fab
  fab: {
    position: "absolute", right: 18, bottom: 20, height: 52,
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingLeft: 16, paddingRight: 20, borderRadius: 26,
    backgroundColor: t.brandPrimary, ...shadow1,
  },
  fabText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  // card
  card: {
    backgroundColor: t.surfaceSecondary, borderRadius: CARD_RADIUS,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: {
    backgroundColor: t.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 16, fontWeight: "700" },
  authorName: { fontSize: 15, fontWeight: "700", color: t.onSurface },
  meta: { fontSize: 12, color: t.onSurfaceMuted, marginTop: 2 },
  typeChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
    backgroundColor: t.surfaceTertiary,
  },
  typeChipText: { fontSize: 12, color: t.onSurfaceMuted, fontWeight: "600" },
  title: {
    fontSize: 19, fontWeight: "800", color: t.onSurface, marginTop: 16,
    lineHeight: 26, letterSpacing: -0.3,
  },
  body: { fontSize: 15, color: t.onSurface, marginTop: 8, lineHeight: 23 },
  showMore: { fontSize: 14, fontWeight: "700", color: t.brandPrimary, marginTop: 8 },

  // media
  mediaWrap: { marginTop: 14, gap: 10 },
  mediaSingle: { borderRadius: INNER_RADIUS, backgroundColor: t.surfaceTertiary },
  mediaScroll: { borderRadius: INNER_RADIUS, overflow: "hidden" },
  mediaCounter: {
    position: "absolute", right: 10, bottom: 10, paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: radii.pill, backgroundColor: "rgba(0,0,0,0.6)",
  },
  mediaCounterText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  videoRow: {
    height: 170, alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: INNER_RADIUS, backgroundColor: "#1E293B", overflow: "hidden",
  },
  videoPlay: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: t.brandPrimary,
    alignItems: "center", justifyContent: "center", paddingLeft: 3,
  },
  videoLabel: { color: "#fff", fontSize: 13, fontWeight: "600", maxWidth: "80%" },

  // tags
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  tag: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill,
    backgroundColor: t.brandTertiary,
  },
  tagText: { fontSize: 12, color: t.onBrandTertiary, fontWeight: "700" },
  tagOutline: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill,
    borderWidth: 1, borderColor: t.border,
  },
  tagOutlineText: { fontSize: 12, color: t.onSurfaceMuted, fontWeight: "500" },

  // AI answer — the one tinted block on the card
  aiBox: {
    marginTop: 16, padding: 14, gap: 10, borderRadius: INNER_RADIUS,
    backgroundColor: t.brandTertiary,
  },
  aiStatus: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10,
    marginTop: 16, padding: 14, borderRadius: INNER_RADIUS,
    backgroundColor: t.surfaceTertiary,
  },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiIcon: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: t.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  aiBadge: { fontSize: 14, fontWeight: "800", color: t.onBrandTertiary },
  aiAnswer: { fontSize: 15, color: t.onBrandTertiary, lineHeight: 22 },
  aiMuted: { fontSize: 13, color: t.onSurfaceMuted, flex: 1, lineHeight: 18 },
  cites: { gap: 8, paddingTop: 2, paddingRight: 4 },
  citePill: {
    maxWidth: 220, flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6, paddingLeft: 6, paddingRight: 12,
    borderRadius: radii.pill, backgroundColor: t.surfaceSecondary,
  },
  citeNum: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: t.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  citeNumText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  citeText: { flexShrink: 1, fontSize: 13, color: t.onSurface, fontWeight: "600" },

  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: t.brandPrimary, paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: radii.pill,
  },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // actions
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  action: {
    flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36,
    paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: t.surfaceTertiary,
  },
  actionLiked: { backgroundColor: t.surfaceTertiary },
  actionText: { fontSize: 13, color: t.onSurfaceMuted, fontWeight: "700" },
  saveBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  // empty / error / skeleton
  center: { alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: t.onSurface, textAlign: "center" },
  errorText: { fontSize: 14, color: t.onSurfaceMuted, textAlign: "center", lineHeight: 20 },
  skel: { backgroundColor: t.surfaceTertiary, borderRadius: 6 },
});
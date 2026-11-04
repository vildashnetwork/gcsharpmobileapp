/**
 * Learning Feed post detail (Phase 1 + 7).
 * Full post + AI explanation with citations + threaded comments/replies.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, Image, Linking, KeyboardAvoidingView, Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/src/theme-context";
import { radii, spacing, shadow1, type Palette } from "@/src/theme";
import { api } from "@/src/api";
import { timeAgo } from "@/src/lib/timeAgo";
import { useRelativeTimeNow } from "@/src/hooks/useRelativeTimeNow";
import { MediaBlock } from "@/src/components/FeedMediaBlock";
import type { FeedComment, FeedPost } from "../(tabs)/feed";

const AI_ANSWER_COLLAPSE_CHARS = 320;
const OCR_COLLAPSE_CHARS = 220;

function CommentItem({ c, isReply, now, onReply, onDelete }: {
  c: FeedComment; isReply?: boolean;
  now: number;
  onReply: (c: FeedComment) => void; onDelete: (c: FeedComment) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View style={[styles.comment, isReply && styles.commentReply]}>
      <View style={styles.commentHead}>
        {c.author?.profile_photo ? (
          <Image source={{ uri: c.author.profile_photo }} style={styles.commentAvatar} />
        ) : (
          <View style={[styles.commentAvatar, styles.commentAvatarFallback]}>
            <Text style={styles.commentAvatarInitial}>
              {(c.author?.full_name || "S").trim().charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.commentIdentity}>
          <Text style={styles.commentAuthor} numberOfLines={1}>
            {c.author?.full_name || "Student"}
          </Text>
          <Text style={styles.commentTime}>{timeAgo(c.created_at, now)}</Text>
        </View>
      </View>
      {!!c.body && <Text style={styles.commentBody}>{c.body}</Text>}
      <View style={styles.commentActions}>
        {!isReply && (
          <Pressable onPress={() => onReply(c)} hitSlop={6}
            accessibilityRole="button" accessibilityLabel={`Reply to ${c.author?.full_name || "student"}`}>
            <Text style={styles.commentAction}>Reply</Text>
          </Pressable>
        )}
        {c.is_author && (
          <Pressable onPress={() => onDelete(c)} hitSlop={6}
            accessibilityRole="button" accessibilityLabel="Delete comment">
            <Text style={[styles.commentAction, { color: t.error }]}>Delete</Text>
          </Pressable>
        )}
      </View>
      {(c.replies || []).map((r) => (
        <CommentItem key={r.comment_id} c={r} isReply
          now={now}
          onReply={onReply} onDelete={onDelete} />
      ))}
    </View>
  );
}

export default function PostDetailScreen() {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const relativeTimeNow = useRelativeTimeNow();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postMediaWidth = Math.max(200, width - spacing.md * 4);

  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [sending, setSending] = useState(false);
  const [expandedAiPostId, setExpandedAiPostId] = useState<string | null>(null);
  const [expandedOcrPostId, setExpandedOcrPostId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api<FeedPost & { comments?: FeedComment[] }>(`/feed/posts/${id}`);
      setError(null);
      setPost(data);
      setComments(data.comments || []);
    } catch (e: any) {
      setError(e?.message || "Could not load this post.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // poll while the GCSharp model is still writing the explanation
  useEffect(() => {
    if (!post || (post.ai_status !== "pending" && post.ai_status !== "generating")) return;
    const timer = setTimeout(load, 6000);
    return () => clearTimeout(timer);
  }, [post, load]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !id) return;
    setSending(true);
    try {
      await api<FeedComment>(`/feed/posts/${id}/comments`, {
        method: "POST",
        body: { body, parent_comment_id: replyTo?.comment_id ?? null },
      });
      setDraft("");
      setReplyTo(null);
      await load();
    } catch (e: any) {
      // surface but keep the draft so nothing is lost
      setError(e?.message || "Could not post the comment.");
    } finally {
      setSending(false);
    }
  }, [draft, id, replyTo, load]);

  const removeComment = useCallback(async (c: FeedComment) => {
    try {
      await api(`/comments/${c.comment_id}`, { method: "DELETE" });
      await load();
    } catch {}
  }, [load]);

  const retryAi = useCallback(async () => {
    if (!id) return;
    try {
      await api(`/feed/posts/${id}/ai/retry`, { method: "POST" });
      setPost((p) => (p ? { ...p, ai_status: "generating" } : p));
      setTimeout(load, 5000);
    } catch {}
  }, [id, load]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={t.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.brandPrimary} />
        </View>
      ) : error && !post ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={t.onSurfaceMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : post ? (
        <KeyboardAvoidingView style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={90}>
          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 12, paddingBottom: 24 }}>
            {/* post */}
            <View style={styles.card}>
              <View style={styles.authorRow}>
                {post.author?.profile_photo ? (
                  <Image source={{ uri: post.author.profile_photo }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="person" size={16} color="#fff" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.authorName}>{post.author?.full_name}</Text>
                  <Text style={styles.meta}>
                    {timeAgo(post.created_at, relativeTimeNow)} · {post.exam_level}
                  </Text>
                </View>
                <View style={styles.typeChip}>
                  <Text style={styles.typeChipText}>{post.question_type}</Text>
                </View>
              </View>
              {!!post.title && <Text style={styles.title}>{post.title}</Text>}
              {!!post.body && <Text style={styles.bodyText}>{post.body}</Text>}

              {!!post.media?.length && (
                <View style={styles.postMedia}>
                  <MediaBlock media={post.media} cardWidth={postMediaWidth}
                    inlineVideos />
                </View>
              )}

              {/* AI explanation */}
              {post.ai_status === "ready" && post.ai_answer ? (
                <View style={styles.aiBox}>
                  <View style={styles.aiHeader}>
                    <Ionicons name="sparkles" size={14} color={t.brandPrimary} />
                    <Text style={styles.aiBadge}>GC AI explanation</Text>
                  </View>
                  {!!post.ocr_text && (
                    <View style={styles.ocrBox}>
                      <Text style={styles.ocrLabel}>Question read from image</Text>
                      <Text style={styles.ocrText}
                        numberOfLines={post.ocr_text.length > OCR_COLLAPSE_CHARS &&
                          expandedOcrPostId !== post.post_id ? 5 : undefined}>
                        {post.ocr_text}
                      </Text>
                      {post.ocr_text.length > OCR_COLLAPSE_CHARS && (
                        <Pressable
                          style={styles.aiExpandButton}
                          onPress={() => setExpandedOcrPostId(
                            expandedOcrPostId === post.post_id ? null : post.post_id)}
                          accessibilityRole="button"
                          accessibilityLabel={expandedOcrPostId === post.post_id
                            ? "Show less recognized question" : "Show more recognized question"}>
                          <Text style={styles.aiExpandText}>
                            {expandedOcrPostId === post.post_id ? "Show less" : "Show more"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                  <Text style={styles.aiAnswer}
                    numberOfLines={post.ai_answer.length > AI_ANSWER_COLLAPSE_CHARS &&
                      expandedAiPostId !== post.post_id ? 7 : undefined}>
                    {post.ai_answer}
                  </Text>
                  {post.ai_answer.length > AI_ANSWER_COLLAPSE_CHARS && (
                    <Pressable
                      style={styles.aiExpandButton}
                      onPress={() => setExpandedAiPostId(
                        expandedAiPostId === post.post_id ? null : post.post_id)}
                      accessibilityRole="button"
                      accessibilityLabel={expandedAiPostId === post.post_id
                        ? "Show less AI explanation" : "Show more AI explanation"}>
                      <Text style={styles.aiExpandText}>
                        {expandedAiPostId === post.post_id ? "Show less" : "Show more"}
                      </Text>
                      <Ionicons
                        name={expandedAiPostId === post.post_id ? "chevron-up" : "chevron-down"}
                        size={14}
                        color={t.brandPrimary}
                      />
                    </Pressable>
                  )}
                  {(post.ai_citations?.length ?? 0) > 0 && (
                    <View style={{ marginTop: 8, gap: 4 }}>
                      <Text style={styles.citesLabel}>Sources:</Text>
                      {post.ai_citations!.map((c2, i2) => (
                        <Pressable key={`${c2.url}-${i2}`} style={styles.citeRow}
                          onPress={() => Linking.openURL(c2.url).catch(() => {})}>
                          <Ionicons name="link-outline" size={12} color={t.brandPrimary} />
                          <Text style={styles.citeText} numberOfLines={1}>
                            {c2.title || c2.url}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              ) : post.ai_status === "pending" || post.ai_status === "generating" ? (
                <View style={styles.aiBox}>
                  <ActivityIndicator size="small" color={t.brandPrimary} />
                  <Text style={styles.aiMuted}>
                    {post.media?.some((media) => media.type === "image")
                      ? "GC AI is reading your image and preparing an explanation…"
                      : "GC AI is preparing an explanation…"}
                  </Text>
                </View>
              ) : post.ai_status === "unavailable" || post.ai_status === "error" ? (
                <View style={styles.aiBox}>
                  <Ionicons name="cloud-offline-outline" size={18} color={t.warning} />
                  <Text style={styles.aiMuted}>GC AI is temporarily unavailable. Please try again shortly.</Text>
                  <Pressable style={styles.retryBtn} onPress={retryAi}>
                    <Ionicons name="refresh" size={14} color="#fff" />
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            {/* comments */}
            <View style={styles.commentsHeading}>
              <View style={styles.commentsHeadingText}>
                <Text style={styles.sectionTitle}>Comments</Text>
                <Text style={styles.commentsSubtitle}>Join the discussion on this post</Text>
              </View>
              <View style={styles.commentCount}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color={t.brandPrimary} />
                <Text style={styles.commentCountText}>{post.comment_count || 0}</Text>
              </View>
            </View>
            {comments.length === 0 ? (
              <View style={styles.emptyComments}>
                <View style={styles.emptyCommentsIcon}>
                  <Ionicons name="chatbubble-ellipses-outline" size={22} color={t.brandPrimary} />
                </View>
                <Text style={styles.emptyCommentsTitle}>Start the conversation</Text>
                <Text style={styles.aiMuted}>Be the first to share an idea or help answer this post.</Text>
              </View>
            ) : comments.map((c) => (
              <CommentItem key={commentKey(c)} c={c} now={relativeTimeNow}
                onReply={(cc) => setReplyTo(cc)}
                onDelete={removeComment} />
            ))}
          </ScrollView>

          {/* composer */}
          <View style={styles.composer}>
            {replyTo && (
              <View style={styles.replyBar}>
                <Text style={styles.replyText} numberOfLines={1}>
                  Replying to {replyTo.author?.full_name}
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={t.onSurfaceMuted} />
                </Pressable>
              </View>
            )}
            <View style={styles.composerRow}>
              <TextInput
                style={styles.composerInput}
                placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
                placeholderTextColor={t.onSurfaceMuted}
                value={draft} onChangeText={setDraft} multiline maxLength={4000} />
              <Pressable
                style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.5 }]}
                onPress={send} disabled={!draft.trim() || sending}
                testID="feed-send-comment">
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="send" size={16} color="#fff" />}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </SafeAreaView>
  );
}


function commentKey(c: FeedComment): string {
  return c.comment_id || `${c.author?.user_id}-${c.created_at}`;
}

const createStyles = (t: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: t.divider,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: t.onSurface },
  center: { alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  errorText: { fontSize: 13, color: t.onSurfaceMuted, textAlign: "center" },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: t.brandPrimary, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radii.pill,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
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
  typeChipText: { fontSize: 10, color: t.onSurfaceMuted, fontWeight: "600"   },
  title: { fontSize: 18, fontWeight: "800", color: t.onSurface, marginTop: 10 },
  bodyText: { fontSize: 15, color: t.onSurface, marginTop: 8, lineHeight: 21 },
  aiBox: {
    marginTop: 12, padding: 12, borderRadius: radii.sm,
    backgroundColor: t.surfaceTertiary, gap: 6,
  },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiBadge: { fontSize: 12, fontWeight: "700", color: t.brandPrimary },
  ocrBox: {
    marginTop: 4, padding: 10, borderRadius: radii.sm,
    backgroundColor: t.surfaceSecondary, gap: 5,
  },
  ocrLabel: { fontSize: 12, fontWeight: "800", color: t.onSurface },
  ocrText: { fontSize: 13, color: t.onSurface, lineHeight: 19 },
  aiAnswer: { fontSize: 14, color: t.onSurface, lineHeight: 20 },
  aiExpandButton: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center",
    gap: 4, paddingVertical: 3,
  },
  aiExpandText: { fontSize: 13, fontWeight: "700", color: t.brandPrimary },
  aiMuted: { fontSize: 12, color: t.onSurfaceMuted },
  citesLabel: { fontSize: 11, fontWeight: "700", color: t.onSurfaceMuted },
  citeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  citeText: { fontSize: 12, color: t.brandPrimary, flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: t.onSurface, marginTop: 4 },
  postMedia: { marginTop: 12, alignItems: "center" },
  commentsHeading: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 2, marginTop: 4,
  },
  commentsHeadingText: { gap: 3 },
  commentsSubtitle: { fontSize: 12, color: t.onSurfaceMuted },
  commentCount: {
    minWidth: 44, height: 32, paddingHorizontal: 10, borderRadius: radii.pill,
    backgroundColor: t.surfaceSecondary, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 5,
  },
  commentCountText: { fontSize: 12, fontWeight: "700", color: t.onSurface },
  emptyComments: {
    alignItems: "center", gap: 7, padding: spacing.lg,
    backgroundColor: t.surfaceSecondary, borderRadius: radii.md,
  },
  emptyCommentsIcon: {
    width: 42, height: 42, borderRadius: 21, alignItems: "center",
    justifyContent: "center", backgroundColor: t.surfaceTertiary,
  },
  emptyCommentsTitle: { fontSize: 14, fontWeight: "700", color: t.onSurface },
  comment: {
    backgroundColor: t.surfaceSecondary, borderRadius: radii.md,
    padding: spacing.md, ...shadow1,
  },
  commentReply: {
    marginTop: 8, marginLeft: 22, backgroundColor: t.surfaceTertiary,
  },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarFallback: {
    backgroundColor: t.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  commentAvatarInitial: { color: "#fff", fontSize: 13, fontWeight: "800" },
  commentIdentity: { flex: 1, gap: 2 },
  commentAuthor: { fontSize: 13, fontWeight: "700", color: t.onSurface },
  commentTime: { fontSize: 10, color: t.onSurfaceMuted },
  commentBody: { fontSize: 14, color: t.onSurface, marginTop: 10, lineHeight: 20 },
  commentActions: { flexDirection: "row", gap: 18, marginTop: 10 },
  commentAction: { fontSize: 12, color: t.brandPrimary, fontWeight: "700" },
  composer: {
    borderTopWidth: 1, borderTopColor: t.divider,
    backgroundColor: t.surfaceSecondary, padding: spacing.sm,
  },
  replyBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 6, paddingVertical: 4,
  },
  replyText: { fontSize: 11, color: t.onSurfaceMuted, flex: 1 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  composerInput: {
    flex: 1, backgroundColor: t.surface, borderRadius: radii.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: t.onSurface, maxHeight: 120, borderWidth: 1, borderColor: t.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: t.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
});

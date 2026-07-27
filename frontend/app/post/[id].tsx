import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, Comment, Post, api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { PostCard } from "@/src/components/post-card";
import { useToast } from "@/src/components/toast";
import { ErrorState, Skeleton } from "@/src/components/ui";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Comment>>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [p, c] = await Promise.all([api.post(String(id)), api.comments(String(id))]);
      setPost(p);
      setComments(c);
    } catch {
      setError("We couldn't load this post.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const created = await api.addComment(String(id), text, replyTo?.id);
      setComments((prev) => [...(prev ?? []), created]);
      setDraft("");
      setReplyTo(null);
      setPost((p) => (p ? { ...p, comment_count: p.comment_count + 1 } : p));
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not post your comment", "error");
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment: Comment) => {
    setComments((prev) => (prev ?? []).filter((c) => c.id !== comment.id));
    try {
      await api.deleteComment(comment.id);
      setPost((p) => (p ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p));
    } catch {
      load();
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="post-back-button" onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
        {post && user && post.author.id === user.id ? (
          <Pressable
            testID="post-delete-button"
            onPress={async () => {
              try {
                await api.deletePost(post.id);
                toast.show("Post deleted", "info");
                router.back();
              } catch {
                toast.show("Could not delete this post", "error");
              }
            }}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Feather name="trash-2" size={18} color={colors.error} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !post ? (
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <Skeleton height={300} />
          <Skeleton height={80} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "translate-with-padding" : "height"}
        >
          <FlatList
            testID="post-comments-list"
            ref={listRef}
            data={comments ?? []}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <>
                <PostCard post={post} onOpen={() => undefined} />
                {post.recipe ? (
                  <View testID="post-recipe-detail" style={styles.recipeBox}>
                    <Text style={styles.recipeKicker}>INGREDIENTS</Text>
                    {post.recipe.ingredients.map((ing, i) => (
                      <Text key={i} style={styles.recipeLine}>
                        · {ing}
                      </Text>
                    ))}
                    {post.recipe.instructions.length > 0 ? (
                      <>
                        <Text style={[styles.recipeKicker, { marginTop: spacing.lg }]}>METHOD</Text>
                        {post.recipe.instructions.map((step, i) => (
                          <View key={i} style={styles.step}>
                            <Text style={styles.stepNum}>{i + 1}</Text>
                            <Text style={styles.stepText}>{step}</Text>
                          </View>
                        ))}
                      </>
                    ) : null}
                  </View>
                ) : null}
                <Text style={styles.commentsLabel}>
                  {post.comment_count} {post.comment_count === 1 ? "COMMENT" : "COMMENTS"}
                </Text>
              </>
            }
            ListEmptyComponent={
              comments === null ? (
                <Skeleton height={60} />
              ) : (
                <Text testID="comments-empty" style={styles.empty}>
                  No comments yet — start the conversation.
                </Text>
              )
            }
            renderItem={({ item }) => (
              <View testID={`comment-${item.id}`} style={[styles.comment, item.parent_id && styles.reply]}>
                <View style={styles.commentAvatar}>
                  <Text style={styles.commentAvatarText}>
                    {(item.author.name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.commentAuthor}>{item.author.name}</Text>
                  <Text style={styles.commentText}>{item.content}</Text>
                  <View style={styles.commentActions}>
                    <Pressable testID={`comment-reply-${item.id}`} onPress={() => setReplyTo(item)} hitSlop={6}>
                      <Text style={styles.commentAction}>Reply</Text>
                    </Pressable>
                    {user && item.author.id === user.id ? (
                      <Pressable testID={`comment-delete-${item.id}`} onPress={() => remove(item)} hitSlop={6}>
                        <Text style={[styles.commentAction, { color: colors.error }]}>Delete</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            )}
          />

          <View style={[styles.composer, { paddingBottom: spacing.md }]}>
            {replyTo ? (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText} numberOfLines={1}>
                  Replying to {replyTo.author.name}
                </Text>
                <Pressable testID="cancel-reply-button" onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Feather name="x" size={14} color={colors.muted} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.composerRow}>
              <TextInput
                testID="comment-input"
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment…"
                placeholderTextColor="#B3AEA6"
                style={styles.input}
                multiline
              />
              <Pressable
                testID="comment-send-button"
                onPress={send}
                disabled={!draft.trim() || sending}
                style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.45 }]}
              >
                <Feather name="arrow-up" size={18} color={colors.onBrand} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: fonts.text, fontSize: type.lg, fontWeight: "600", color: colors.onSurface },
  recipeBox: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  recipeKicker: {
    fontFamily: fonts.text,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.brand,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  recipeLine: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, lineHeight: 22 },
  step: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm },
  stepNum: { fontFamily: fonts.display, fontSize: type.base, color: colors.brand, width: 16 },
  stepText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, lineHeight: 21 },
  commentsLabel: {
    fontFamily: fonts.text,
    fontSize: type.sm,
    letterSpacing: 1.3,
    color: colors.muted,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  empty: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  comment: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  reply: { marginLeft: spacing.xl },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarText: { fontFamily: fonts.display, fontSize: type.base, color: colors.brand },
  commentAuthor: { fontFamily: fonts.display, fontSize: type.base, color: colors.onSurface },
  commentText: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, lineHeight: 20, marginTop: 2 },
  commentActions: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.xs },
  commentAction: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, fontWeight: "600" },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  replyBannerText: { flex: 1, fontFamily: fonts.text, fontSize: type.sm, color: colors.muted },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.text,
    fontSize: type.base,
    color: colors.onSurface,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});

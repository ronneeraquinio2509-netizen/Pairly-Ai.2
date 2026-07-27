import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { memo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { Post, api } from "@/src/api";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export const PostCard = memo(function PostCard({
  post,
  onOpen,
  onShare,
}: {
  post: Post;
  onOpen?: () => void;
  onShare?: () => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.is_liked);
  const [likes, setLikes] = useState(post.like_count);
  const [saved, setSaved] = useState(post.is_bookmarked);

  const like = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const res = await api.toggleLike(post.id);
      setLiked(res.is_liked);
      setLikes(res.like_count);
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  };

  const bookmark = async () => {
    const next = !saved;
    setSaved(next);
    try {
      const res = await api.toggleBookmark(post.id);
      setSaved(res.is_bookmarked);
    } catch {
      setSaved(!next);
    }
  };

  const open = onOpen ?? (() => router.push(`/post/${post.id}`));
  const recipe = post.recipe;

  return (
    <View testID={`post-card-${post.id}`} style={styles.card}>
      <Pressable
        testID={`post-author-${post.id}`}
        onPress={() => router.push(`/user/${post.author.id}`)}
        style={styles.head}
      >
        {post.author.avatar_b64 ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${post.author.avatar_b64}` }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{(post.author.name || "?").charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {post.author.name}
            </Text>
            {post.author.role === "chef" ? (
              <View style={styles.chefTag}>
                <Text style={styles.chefTagText}>CHEF</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            @{post.author.username} · {relativeTime(post.created_at)}
          </Text>
        </View>
      </Pressable>

      {post.images.length > 0 ? (
        <Pressable testID={`post-media-${post.id}`} onPress={open}>
          <Image
            source={{ uri: `data:image/jpeg;base64,${post.images[0]}` }}
            style={styles.media}
            contentFit="cover"
            transition={220}
          />
          {post.images.length > 1 ? (
            <View style={styles.countBadge}>
              <Feather name="copy" size={11} color={colors.onSurfaceInverse} />
              <Text style={styles.countBadgeText}>{post.images.length}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      <Pressable onPress={open} style={styles.body}>
        {recipe?.title ? <Text style={styles.recipeTitle}>{recipe.title}</Text> : null}
        {post.caption ? (
          <Text style={styles.caption} numberOfLines={4}>
            {post.caption}
          </Text>
        ) : null}

        {recipe ? (
          <View style={styles.chipRow}>
            {[
              recipe.cuisine,
              recipe.difficulty,
              recipe.prep_time_min + recipe.cook_time_min > 0
                ? `${recipe.prep_time_min + recipe.cook_time_min} min`
                : "",
              recipe.nutrition?.calories,
            ]
              .filter(Boolean)
              .map((label) => (
                <View key={label} style={styles.chip}>
                  <Text style={styles.chipText}>{label}</Text>
                </View>
              ))}
          </View>
        ) : null}

        {post.hashtags.length > 0 ? (
          <Text style={styles.tags}>{post.hashtags.map((t) => `#${t}`).join("  ")}</Text>
        ) : null}
      </Pressable>

      <View style={styles.actions}>
        <Pressable testID={`post-like-${post.id}`} onPress={like} style={styles.action} hitSlop={6}>
          <Feather name="heart" size={18} color={liked ? colors.brand : colors.muted} />
          <Text style={[styles.actionText, liked && { color: colors.brand }]}>{likes}</Text>
        </Pressable>
        <Pressable testID={`post-comment-${post.id}`} onPress={open} style={styles.action} hitSlop={6}>
          <Feather name="message-square" size={18} color={colors.muted} />
          <Text style={styles.actionText}>{post.comment_count}</Text>
        </Pressable>
        <Pressable testID={`post-bookmark-${post.id}`} onPress={bookmark} style={styles.action} hitSlop={6}>
          <Feather name="bookmark" size={18} color={saved ? colors.brand : colors.muted} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {onShare ? (
          <Pressable testID={`post-share-${post.id}`} onPress={onShare} style={styles.action} hitSlop={6}>
            <Feather name="share-2" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  avatarLetter: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onBrand },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onSurface, flexShrink: 1 },
  chefTag: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  chefTagText: { fontFamily: fonts.text, fontSize: 9, letterSpacing: 1, color: colors.brand, fontWeight: "700" },
  meta: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: 1 },
  media: { width: "100%", height: 300, backgroundColor: colors.surfaceTertiary },
  countBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(31,30,29,0.65)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  countBadgeText: { fontFamily: fonts.text, fontSize: 10, color: colors.onSurfaceInverse, fontWeight: "700" },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  recipeTitle: { fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface, marginBottom: spacing.xs },
  caption: { fontFamily: fonts.text, fontSize: type.base, lineHeight: 21, color: colors.onSurface },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  chip: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  chipText: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, fontWeight: "500" },
  tags: { fontFamily: fonts.text, fontSize: type.sm, color: colors.brand, marginTop: spacing.sm },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  actionText: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, fontWeight: "600" },
});

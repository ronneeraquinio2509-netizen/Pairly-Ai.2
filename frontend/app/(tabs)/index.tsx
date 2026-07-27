import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Notification, Post, api } from "@/src/api";
import { useToast } from "@/src/components/toast";
import { PostCard } from "@/src/components/post-card";
import { EmptyState, ErrorState, Skeleton } from "@/src/components/ui";
import { shareToWhatsApp } from "@/src/share";
import { colors, fonts, images, radius, spacing, type } from "@/src/theme";

const SCOPES = [
  { key: "for_you", label: "For you" },
  { key: "following", label: "Following" },
] as const;

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [scope, setScope] = useState<"for_you" | "following">("for_you");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async (nextScope = scope) => {
    setError("");
    try {
      const [data, notes] = await Promise.all([
        api.feed(nextScope),
        api.notifications().catch(() => [] as Notification[]),
      ]);
      setPosts(data);
      setUnread(notes.filter((n) => !n.read).length);
    } catch {
      setError("We couldn't load the feed right now.");
    }
  }, [scope]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const switchScope = (next: "for_you" | "following") => {
    setScope(next);
    setPosts(null);
    load(next);
  };

  const share = async (post: Post) => {
    const text = [
      post.recipe?.title ?? "A pairing from Pairly",
      post.caption,
      post.recipe ? `\nIngredients:\n${post.recipe.ingredients.join("\n")}` : "",
      "\nShared from Pairly",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await shareToWhatsApp(text);
    } catch {
      toast.show("Sharing is unavailable on this device", "error");
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerTop}>
          <Text style={styles.brand}>Pairly</Text>
          <Pressable
            testID="notifications-button"
            onPress={() => router.push("/notifications")}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Feather name="bell" size={20} color={colors.onSurface} />
            {unread > 0 ? (
              <View testID="notifications-badge" style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        <View style={styles.scopeRow}>
          {SCOPES.map((s) => (
            <Pressable
              key={s.key}
              testID={`feed-scope-${s.key}`}
              onPress={() => switchScope(s.key)}
              style={[styles.scope, scope === s.key && styles.scopeActive]}
            >
              <Text style={[styles.scopeText, scope === s.key && styles.scopeTextActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error ? (
        <ErrorState message={error} onRetry={() => load()} />
      ) : posts === null ? (
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <Skeleton height={320} />
          <Skeleton height={320} />
        </View>
      ) : posts.length === 0 ? (
        <View>
          <EmptyState
            testID="feed-empty-state"
            image={images.auth}
            title={scope === "following" ? "Follow some cooks" : "The kitchen is quiet"}
            body={
              scope === "following"
                ? "Posts from cooks you follow will show up here. Find people in Search."
                : "Be the first to post a recipe or a plate you're proud of."
            }
          />
          <View style={{ paddingHorizontal: spacing.xl }}>
            <Pressable testID="feed-empty-create" onPress={() => router.push("/create")} style={styles.emptyCta}>
              <Feather name="plus" size={16} color={colors.onBrand} />
              <Text style={styles.emptyCtaText}>Create a post</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <FlatList
          testID="feed-list"
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.brand}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          renderItem={({ item }) => <PostCard post={item} onShare={() => share(item)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  brand: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 8,
    right: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fonts.text, fontSize: 9, color: colors.onBrand, fontWeight: "700" },
  scopeRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  scope: {
    height: 34,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: "center",
  },
  scopeActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  scopeText: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, fontWeight: "500" },
  scopeTextActive: { color: colors.onSurfaceInverse, fontWeight: "600" },
  emptyCta: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  emptyCtaText: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "600", color: colors.onBrand },
});

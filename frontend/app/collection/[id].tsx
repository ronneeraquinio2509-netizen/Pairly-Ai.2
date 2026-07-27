import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Post, api } from "@/src/api";
import { PostCard } from "@/src/components/post-card";
import { ErrorState, Skeleton } from "@/src/components/ui";
import { colors, fonts, spacing, type } from "@/src/theme";

export default function CollectionScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setPosts(await api.collectionPosts(String(id)));
    } catch {
      setError("We couldn't open this collection.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="collection-back-button" onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{name ?? "Collection"}</Text>
      </View>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : posts === null ? (
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <Skeleton height={260} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
          {posts.length === 0 ? (
            <Text testID="collection-empty" style={styles.empty}>
              Nothing saved here yet. Tap the bookmark on any post to add it.
            </Text>
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface },
  empty: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, lineHeight: 21 },
});

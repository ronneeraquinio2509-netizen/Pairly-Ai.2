import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Collection, Post, PublicProfile, api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { PostCard } from "@/src/components/post-card";
import { Skeleton } from "@/src/components/ui";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

const TABS = [
  { key: "posts", label: "Posts" },
  { key: "saved", label: "Collections" },
  { key: "liked", label: "Liked" },
];

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [tab, setTab] = useState("posts");
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [liked, setLiked] = useState<Post[] | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [p, c] = await Promise.all([api.publicProfile(user.id), api.collections()]);
      setProfile(p);
      setCollections(c);
    } catch {
      setProfile(null);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openLiked = async () => {
    setTab("liked");
    if (liked === null) {
      try {
        setLiked(await api.likedPosts());
      } catch {
        setLiked([]);
      }
    }
  };

  return (
    <ScrollView
      style={styles.root}
      testID="profile-scroll"
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <View style={styles.cover}>
        {profile?.cover_b64 ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${profile.cover_b64}` }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : null}
        <View style={[styles.coverActions, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            testID="profile-settings-button"
            onPress={() => router.push("/settings")}
            style={styles.roundBtn}
            hitSlop={8}
          >
            <Feather name="settings" size={17} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <View style={styles.identity}>
        {user?.avatar_b64 ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${user.avatar_b64}` }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{(user?.name ?? "?").charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text testID="profile-name" style={styles.name}>
          {user?.name}
        </Text>
        <Text style={styles.username}>
          @{user?.username} · {user?.role === "chef" ? "Chef" : "Home cook"}
          {user?.is_premium ? " · Pro" : ""}
        </Text>
        {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
        <View style={styles.metaRow}>
          {user?.location ? (
            <View style={styles.metaItem}>
              <Feather name="map-pin" size={12} color={colors.muted} />
              <Text style={styles.metaText}>{user.location}</Text>
            </View>
          ) : null}
          {user?.favorite_cuisine ? (
            <View style={styles.metaItem}>
              <Feather name="heart" size={12} color={colors.muted} />
              <Text style={styles.metaText}>{user.favorite_cuisine}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.stats}>
          {[
            { label: "Posts", value: profile?.post_count ?? 0, href: null },
            { label: "Recipes", value: profile?.recipe_count ?? 0, href: null },
            { label: "Followers", value: profile?.followers_count ?? 0, href: `/user/${user?.id}` },
            { label: "Following", value: profile?.following_count ?? 0, href: `/user/${user?.id}` },
          ].map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text testID={`profile-stat-${s.label.toLowerCase()}`} style={styles.statValue}>
                {s.value}
              </Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Pressable
          testID="profile-edit-button"
          onPress={() => router.push("/settings")}
          style={styles.editBtn}
        >
          <Feather name="edit-2" size={14} color={colors.onSurface} />
          <Text style={styles.editText}>Edit profile</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            testID={`profile-tab-${t.key}`}
            onPress={() => (t.key === "liked" ? openLiked() : setTab(t.key))}
            style={[styles.tab, tab === t.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.content}>
        {tab === "posts" ? (
          profile === null ? (
            <Skeleton height={260} />
          ) : profile.posts.length === 0 ? (
            <Text testID="profile-posts-empty" style={styles.empty}>
              You haven't posted yet. Share a recipe or a plate from the Create tab.
            </Text>
          ) : (
            profile.posts.map((p) => <PostCard key={p.id} post={p} />)
          )
        ) : null}

        {tab === "saved" ? (
          collections === null ? (
            <Skeleton height={120} />
          ) : (
            collections.map((c) => (
              <Pressable
                key={c.id}
                testID={`collection-row-${c.id}`}
                onPress={() => router.push(`/collection/${c.id}?name=${encodeURIComponent(c.name)}`)}
                style={styles.collectionRow}
              >
                <View style={styles.collectionIcon}>
                  <Feather name="bookmark" size={16} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.collectionName}>{c.name}</Text>
                  <Text style={styles.collectionCount}>
                    {c.count} {c.count === 1 ? "item" : "items"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.borderStrong} />
              </Pressable>
            ))
          )
        ) : null}

        {tab === "liked" ? (
          liked === null ? (
            <Skeleton height={260} />
          ) : liked.length === 0 ? (
            <Text testID="profile-liked-empty" style={styles.empty}>
              Posts you like will collect here.
            </Text>
          ) : (
            liked.map((p) => <PostCard key={p.id} post={p} />)
          )
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  cover: { height: 140, backgroundColor: colors.surfaceTertiary },
  coverActions: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing.lg },
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  identity: { paddingHorizontal: spacing.lg, marginTop: -32 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surfaceTertiary,
  },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  avatarLetter: { fontFamily: fonts.display, fontSize: 30, color: colors.onBrand },
  name: { fontFamily: fonts.display, fontSize: type.xxl, color: colors.onSurface, marginTop: spacing.md },
  username: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, marginTop: 2 },
  bio: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, lineHeight: 21, marginTop: spacing.md },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, marginTop: spacing.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted },
  stats: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.lg },
  stat: {},
  statValue: { fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface },
  statLabel: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginTop: spacing.lg,
  },
  editText: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, fontWeight: "600" },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.brand },
  tabText: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, fontWeight: "600" },
  tabTextActive: { color: colors.onSurface },
  content: { padding: spacing.lg },
  empty: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, lineHeight: 21 },
  collectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  collectionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  collectionName: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onSurface },
  collectionCount: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: 1 },
});

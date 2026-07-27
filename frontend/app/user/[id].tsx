import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PublicProfile, api } from "@/src/api";
import { PostCard } from "@/src/components/post-card";
import { useToast } from "@/src/components/toast";
import { ErrorState, Skeleton } from "@/src/components/ui";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setProfile(await api.publicProfile(String(id)));
    } catch {
      setError("We couldn't load this profile.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const follow = async () => {
    if (!profile || busy) return;
    setBusy(true);
    const next = !profile.is_following;
    setProfile({
      ...profile,
      is_following: next,
      followers_count: profile.followers_count + (next ? 1 : -1),
    });
    try {
      await api.toggleFollow(profile.id);
      toast.show(next ? `Following ${profile.name}` : `Unfollowed ${profile.name}`, "info");
    } catch {
      setProfile(profile);
      toast.show("Could not update follow", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="user-back-button" onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile ? `@${profile.username}` : "Profile"}
        </Text>
      </View>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !profile ? (
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <Skeleton height={120} />
          <Skeleton height={260} />
        </View>
      ) : (
        <ScrollView
          testID="user-profile-scroll"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        >
          <View style={styles.cover}>
            {profile.cover_b64 ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${profile.cover_b64}` }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : null}
          </View>

          <View style={styles.identity}>
            {profile.avatar_b64 ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${profile.avatar_b64}` }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarLetter}>{profile.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text testID="user-profile-name" style={styles.name}>
              {profile.name}
            </Text>
            <Text style={styles.username}>
              @{profile.username} · {profile.role === "chef" ? "Chef" : "Home cook"}
            </Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <View style={styles.stats}>
              {[
                { label: "Posts", value: profile.post_count },
                { label: "Recipes", value: profile.recipe_count },
                { label: "Followers", value: profile.followers_count },
                { label: "Following", value: profile.following_count },
              ].map((s) => (
                <View key={s.label}>
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {profile.is_self ? (
              <Pressable
                testID="user-edit-profile-button"
                onPress={() => router.push("/settings")}
                style={styles.ghostBtn}
              >
                <Text style={styles.ghostBtnText}>Edit profile</Text>
              </Pressable>
            ) : (
              <Pressable
                testID="follow-button"
                onPress={follow}
                style={[styles.followBtn, profile.is_following && styles.followingBtn]}
              >
                <Feather
                  name={profile.is_following ? "user-check" : "user-plus"}
                  size={15}
                  color={profile.is_following ? colors.onSurface : colors.onBrand}
                />
                <Text style={[styles.followText, profile.is_following && { color: colors.onSurface }]}>
                  {profile.is_following ? "Following" : "Follow"}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.posts}>
            {profile.posts.length === 0 ? (
              <Text testID="user-posts-empty" style={styles.empty}>
                No posts yet.
              </Text>
            ) : (
              profile.posts.map((p) => <PostCard key={p.id} post={p} />)
            )}
          </View>
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
  headerTitle: { flex: 1, fontFamily: fonts.text, fontSize: type.lg, fontWeight: "600", color: colors.onSurface },
  cover: { height: 130, backgroundColor: colors.surfaceTertiary },
  identity: { paddingHorizontal: spacing.lg, marginTop: -30 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surfaceTertiary,
  },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  avatarLetter: { fontFamily: fonts.display, fontSize: 28, color: colors.onBrand },
  name: { fontFamily: fonts.display, fontSize: type.xxl, color: colors.onSurface, marginTop: spacing.md },
  username: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, marginTop: 2 },
  bio: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, lineHeight: 21, marginTop: spacing.md },
  stats: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.lg },
  statValue: { fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface },
  statLabel: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted },
  followBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    marginTop: spacing.lg,
  },
  followingBtn: { backgroundColor: colors.surfaceTertiary },
  followText: { fontFamily: fonts.text, fontSize: type.base, color: colors.onBrand, fontWeight: "700" },
  ghostBtn: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  ghostBtnText: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, fontWeight: "600" },
  posts: { padding: spacing.lg },
  empty: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
});

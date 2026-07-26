import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Pairing } from "@/src/api";
import { useToast } from "@/src/components/toast";
import { CategoryChips, EmptyState, ErrorState, Skeleton } from "@/src/components/ui";
import { shareToWhatsApp, pairingToText } from "@/src/share";
import { CATEGORIES, colors, fonts, images, radius, spacing, type } from "@/src/theme";

const FILTERS = [{ key: "all", label: "All", icon: "grid" as const }, ...CATEGORIES];

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Pairing[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await api.pairings(true));
    } catch {
      setError("We couldn't load your saved pairings.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const unsave = async (p: Pairing) => {
    setItems((prev) => (prev ? prev.filter((x) => x.id !== p.id) : prev));
    try {
      await api.toggleFavorite(p.id);
      toast.show("Removed from your archive", "info");
    } catch {
      toast.show("Could not update. Pull to refresh.", "error");
      load();
    }
  };

  const share = async (p: Pairing) => {
    try {
      await shareToWhatsApp(pairingToText(p));
    } catch {
      toast.show("Sharing is unavailable on this device", "error");
    }
  };

  const filtered = (items ?? []).filter((p) => filter === "all" || p.category === filter);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.kicker}>YOUR ARCHIVE</Text>
        <Text style={styles.title}>Saved pairings</Text>
        <CategoryChips categories={FILTERS} value={filter} onChange={setFilter} testIDPrefix="saved-filter" />
      </View>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items === null ? (
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          testID="saved-empty-state"
          image={images.wine}
          title="Your culinary archive is empty"
          body="Tap the bookmark on any pairing result to keep it here for later."
        />
      ) : (
        <FlatList
          testID="saved-list"
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`saved-item-${item.id}`}
              onPress={() => router.push(`/pairing/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.cardTop}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.category.toUpperCase()}</Text>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    testID={`saved-share-${item.id}`}
                    hitSlop={10}
                    onPress={() => share(item)}
                    style={styles.iconBtn}
                  >
                    <Feather name="share-2" size={15} color={colors.muted} />
                  </Pressable>
                  <Pressable
                    testID={`saved-remove-${item.id}`}
                    hitSlop={10}
                    onPress={() => unsave(item)}
                    style={styles.iconBtn}
                  >
                    <Feather name="bookmark" size={15} color={colors.brand} />
                  </Pressable>
                </View>
              </View>
              <Text style={styles.cardTitle}>{item.headline || item.query}</Text>
              <Text style={styles.cardBody} numberOfLines={2}>
                {item.pairings.map((i) => i.name).join(" · ")}
              </Text>
            </Pressable>
          )}
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
    paddingBottom: 0,
  },
  kicker: {
    fontFamily: fonts.text,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.brand,
    fontWeight: "700",
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  badge: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeText: { fontFamily: fonts.text, fontSize: 10, letterSpacing: 1.2, color: colors.brand, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.xs },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface, marginBottom: spacing.xs },
  cardBody: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, lineHeight: 20 },
});

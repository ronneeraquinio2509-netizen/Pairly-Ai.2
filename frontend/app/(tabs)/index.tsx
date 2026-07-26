import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api, Pairing, Usage } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/components/toast";
import { CategoryChips, PrimaryButton, Skeleton } from "@/src/components/ui";
import { CATEGORIES, colors, fonts, radius, spacing, type } from "@/src/theme";

const PLACEHOLDERS: Record<string, string> = {
  ingredient: "e.g. smoked paprika, miso, figs",
  dish: "e.g. lamb ragu, mushroom risotto",
  beverage: "e.g. natural orange wine, cold brew",
};

export default function PairScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [category, setCategory] = useState("ingredient");
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Pairing[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, u] = await Promise.all([api.pairings(), api.usage()]);
      setRecent(list);
      setUsage(u);
    } catch {
      setRecent([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const submit = async () => {
    if (!query.trim()) {
      toast.show("Type an ingredient, dish or drink first", "info");
      return;
    }
    setBusy(true);
    try {
      const result = await api.createPairing({ query: query.trim(), category, context: context.trim() });
      setQuery("");
      setContext("");
      await load();
      router.push(`/pairing/${result.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        router.push("/paywall");
      } else {
        toast.show(e instanceof ApiError ? e.message : "Could not reach the kitchen. Try again.", "error");
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const remaining = usage && !usage.is_premium ? Math.max(0, usage.limit - usage.used_today) : null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>
              {user?.role === "chef" ? "CHEF MODE" : "HOME KITCHEN"}
            </Text>
            <Text testID="home-greeting" style={styles.title}>
              What are you{"\n"}pairing today?
            </Text>
          </View>
          <Pressable
            testID="usage-pill"
            onPress={() => router.push("/paywall")}
            style={[styles.pill, usage?.is_premium && { backgroundColor: colors.surfaceInverse }]}
          >
            <Feather
              name={usage?.is_premium ? "star" : "zap"}
              size={12}
              color={usage?.is_premium ? colors.onSurfaceInverse : colors.brand}
            />
            <Text
              style={[styles.pillText, usage?.is_premium && { color: colors.onSurfaceInverse }]}
            >
              {usage?.is_premium ? "Pro" : `${remaining ?? "–"} left`}
            </Text>
          </Pressable>
        </View>
        <CategoryChips
          categories={CATEGORIES}
          value={category}
          onChange={setCategory}
          testIDPrefix="category-chip"
        />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 140 + insets.bottom }]}
        bottomOffset={90}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          testID="pairing-query-input"
          value={query}
          onChangeText={setQuery}
          placeholder={PLACEHOLDERS[category]}
          placeholderTextColor="#B3AEA6"
          style={styles.bigInput}
          multiline
        />
        <View style={styles.divider} />
        <Text style={styles.label}>Cooking context (optional)</Text>
        <TextInput
          testID="pairing-context-input"
          value={context}
          onChangeText={setContext}
          placeholder="Describe what you're making — a Sunday roast, a summer picnic, a tasting menu…"
          placeholderTextColor="#B3AEA6"
          style={styles.contextInput}
          multiline
        />

        <View style={styles.recentHead}>
          <Text style={styles.label}>Recent searches</Text>
          {recent && recent.length > 0 ? (
            <Text style={styles.count}>{recent.length}</Text>
          ) : null}
        </View>

        {recent === null ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        ) : recent.length === 0 ? (
          <Text testID="recent-empty-text" style={styles.emptyText}>
            Your pairing history will appear here. Start with something in your fridge.
          </Text>
        ) : (
          recent.slice(0, 8).map((p) => (
            <Pressable
              key={p.id}
              testID={`recent-item-${p.id}`}
              onPress={() => router.push(`/pairing/${p.id}`)}
              style={({ pressed }) => [styles.recentRow, pressed && { opacity: 0.6 }]}
            >
              <View style={styles.recentIcon}>
                <Feather
                  name={CATEGORIES.find((c) => c.key === p.category)?.icon ?? "package"}
                  size={15}
                  color={colors.brand}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recentTitle} numberOfLines={1}>
                  {p.query}
                </Text>
                <Text style={styles.recentSub} numberOfLines={1}>
                  {p.pairings.map((i) => i.name).slice(0, 3).join(" · ")}
                </Text>
              </View>
              {p.is_favorite ? <Feather name="bookmark" size={15} color={colors.brand} /> : null}
              <Feather name="chevron-right" size={16} color={colors.borderStrong} />
            </Pressable>
          ))
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: spacing.lg }}>
        <View style={[styles.cta, { paddingBottom: insets.bottom > 0 ? spacing.lg : spacing.lg }]}>
          <PrimaryButton
            testID="find-pairing-button"
            label={busy ? "Finding pairings…" : "Find pairings"}
            icon="git-merge"
            onPress={submit}
            loading={busy}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  kicker: {
    fontFamily: fonts.text,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.brand,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.onSurface },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    marginTop: spacing.md,
  },
  pillText: { fontFamily: fonts.text, fontSize: type.sm, color: colors.brand, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  bigInput: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 34,
    color: colors.onSurface,
    minHeight: 76,
    textAlignVertical: "top",
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  label: {
    fontFamily: fonts.text,
    fontSize: type.sm,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: colors.muted,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  contextInput: {
    fontFamily: fonts.text,
    fontSize: type.lg,
    lineHeight: 24,
    color: colors.onSurface,
    minHeight: 64,
    textAlignVertical: "top",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  recentHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  count: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted },
  emptyText: {
    fontFamily: fonts.text,
    fontSize: type.base,
    color: colors.muted,
    lineHeight: 21,
    paddingVertical: spacing.md,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  recentTitle: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onSurface },
  recentSub: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  cta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Usage, api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, fonts, images, radius, spacing, type } from "@/src/theme";

const TOOLS = [
  {
    href: "/ai/pair",
    icon: "git-merge" as const,
    title: "Food pairing",
    body: "Ingredient, dish or drink → 5 pairings with reasoning, flavour profile and nutrition notes.",
  },
  {
    href: "/ai/recipe",
    icon: "book-open" as const,
    title: "Recipe generator",
    body: "Ingredients, diet, budget and time → a full recipe with nutrition and a shopping list.",
  },
  {
    href: "/ai/chat",
    icon: "message-circle" as const,
    title: "Ask Pairly",
    body: "Chat about substitutions, balance and technique while you cook.",
  },
  {
    href: "/ai/menus",
    icon: "layers" as const,
    title: "Menu builder",
    body: "Batch pairing for chefs — hero ingredients become a coursed menu.",
  },
  {
    href: "/saved-pairings",
    icon: "bookmark" as const,
    title: "Saved pairings",
    body: "Your pairing archive and search history.",
  },
];

export default function AiHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.usage().then(setUsage).catch(() => setUsage(null));
    }, []),
  );

  const remaining = usage && !usage.is_premium ? Math.max(0, usage.limit - usage.used_today) : null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      testID="ai-hub-scroll"
    >
      <View style={styles.hero}>
        <Image source={{ uri: images.chef }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} />
        <LinearGradient
          colors={["rgba(31,30,29,0.25)", "rgba(31,30,29,0.85)", colors.surfaceInverse]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.heroText, { paddingTop: insets.top + spacing.xl }]}>
          <Text style={styles.kicker}>{user?.role === "chef" ? "CHEF INTELLIGENCE" : "AI KITCHEN"}</Text>
          <Text style={styles.h1}>What should we{"\n"}cook up?</Text>
          <Pressable testID="ai-usage-pill" onPress={() => router.push("/paywall")} style={styles.pill}>
            <Feather
              name={usage?.is_premium ? "star" : "zap"}
              size={12}
              color={usage?.is_premium ? colors.warning : colors.brandSecondary}
            />
            <Text style={styles.pillText}>
              {usage?.is_premium ? "Pairly Pro — unlimited" : `${remaining ?? "–"} free AI requests left today`}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.list}>
        {TOOLS.map((t) => (
          <Pressable
            key={t.href}
            testID={`ai-tool-${t.href.replace(/\//g, "-")}`}
            onPress={() => router.push(t.href as never)}
            style={({ pressed }) => [styles.tool, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.toolIcon}>
              <Feather name={t.icon} size={17} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toolTitle}>{t.title}</Text>
              <Text style={styles.toolBody}>{t.body}</Text>
            </View>
            <Feather name="chevron-right" size={17} color={colors.borderStrong} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 260, backgroundColor: colors.surfaceInverse, justifyContent: "flex-end" },
  heroText: { padding: spacing.xl },
  kicker: {
    fontFamily: fonts.text,
    fontSize: 10,
    letterSpacing: 2.2,
    color: colors.brandSecondary,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.onSurfaceInverse },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: "rgba(250,249,246,0.14)",
    marginTop: spacing.lg,
  },
  pillText: { fontFamily: fonts.text, fontSize: type.sm, color: colors.onSurfaceInverse, fontWeight: "600" },
  list: { padding: spacing.lg, gap: spacing.md },
  tool: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  toolIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  toolTitle: { fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface },
  toolBody: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, lineHeight: 18, marginTop: 2 },
});

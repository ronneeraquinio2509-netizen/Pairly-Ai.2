import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Pairing } from "@/src/api";
import { categoryImage, colors, fonts, radius, spacing, type } from "@/src/theme";

const CARD_WIDTH = 340;

/**
 * Off-screen branded card captured with react-native-view-shot and shared as an image.
 * Fixed width so the exported PNG looks identical on every device.
 */
export const PairingShareCard = forwardRef<View, { pairing: Pairing; imageUri?: string }>(
  function PairingShareCard({ pairing, imageUri }, ref) {
    const top = pairing.pairings.slice(0, 3);
    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        <View style={styles.hero}>
          <Image
            source={{ uri: imageUri ?? categoryImage(pairing.category) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        <LinearGradient
          colors={["rgba(31,30,29,0.35)", "rgba(31,30,29,0.92)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroText}>
          <View style={styles.brandRow}>
            <Feather name="git-merge" size={12} color={colors.brandSecondary} />
            <Text style={styles.brand}>PAIRLY</Text>
          </View>
          <Text style={styles.query} numberOfLines={2}>
            {pairing.query}
          </Text>
          <Text style={styles.category}>{pairing.category.toUpperCase()} PAIRINGS</Text>
        </View>
      </View>

      <View style={styles.body}>
        {top.map((item, idx) => (
          <View key={`${item.name}-${idx}`} style={styles.item}>
            <Text style={styles.itemIndex}>{String(idx + 1).padStart(2, "0")}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.itemWhy} numberOfLines={3}>
                {item.why}
              </Text>
            </View>
          </View>
        ))}

        {pairing.mini_recipe_title ? (
          <View style={styles.recipe}>
            <Text style={styles.recipeKicker}>MINI RECIPE</Text>
            <Text style={styles.recipeTitle} numberOfLines={2}>
              {pairing.mini_recipe_title}
            </Text>
          </View>
        ) : null}

        <Text style={styles.footer}>Paired with Pairly</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  hero: { height: 150, justifyContent: "flex-end" },
  heroText: { padding: spacing.lg },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: spacing.sm },
  brand: {
    fontFamily: fonts.text,
    fontSize: 9,
    letterSpacing: 2.2,
    color: colors.onSurfaceInverse,
    fontWeight: "700",
  },
  query: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.onSurfaceInverse,
    textTransform: "capitalize",
  },
  category: {
    fontFamily: fonts.text,
    fontSize: 9,
    letterSpacing: 1.6,
    color: colors.brandSecondary,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  body: { padding: spacing.lg, paddingTop: spacing.lg },
  item: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  itemIndex: { fontFamily: fonts.display, fontSize: type.base, color: colors.brandSecondary, paddingTop: 2 },
  itemName: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onSurfaceInverse },
  itemWhy: {
    fontFamily: fonts.text,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(250,249,246,0.72)",
    marginTop: 2,
  },
  recipe: {
    borderTopWidth: 1,
    borderTopColor: "rgba(250,249,246,0.15)",
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  recipeKicker: {
    fontFamily: fonts.text,
    fontSize: 9,
    letterSpacing: 1.6,
    color: colors.brandSecondary,
    fontWeight: "700",
  },
  recipeTitle: {
    fontFamily: fonts.display,
    fontSize: type.lg,
    color: colors.onSurfaceInverse,
    marginTop: 2,
  },
  footer: {
    fontFamily: fonts.text,
    fontSize: 10,
    letterSpacing: 1.2,
    color: "rgba(250,249,246,0.45)",
    textAlign: "center",
  },
});

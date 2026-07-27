import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { api, Pairing } from "@/src/api";
import { useToast } from "@/src/components/toast";
import { PairingShareCard } from "@/src/components/pairing-share-card";
import { ErrorState, Skeleton } from "@/src/components/ui";
import { pairingToText, shareToWhatsApp } from "@/src/share";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

export default function PairingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [sharingCard, setSharingCard] = useState(false);
  const cardRef = useRef<View>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setPairing(await api.pairing(String(id)));
    } catch {
      setError("We couldn't fetch this pairing right now.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFav = async () => {
    if (!pairing) return;
    const next = !pairing.is_favorite;
    setPairing({ ...pairing, is_favorite: next });
    try {
      await api.toggleFavorite(pairing.id);
      toast.show(next ? "Saved to your archive" : "Removed from your archive", next ? "success" : "info");
    } catch {
      setPairing({ ...pairing, is_favorite: !next });
      toast.show("Could not update", "error");
    }
  };

  const share = async () => {
    if (!pairing) return;
    try {
      const via = await shareToWhatsApp(pairingToText(pairing));
      if (via === "share") toast.show("WhatsApp not installed — used the share sheet", "info");
    } catch {
      toast.show("Sharing is unavailable on this device", "error");
    }
  };

  const shareCard = async () => {
    if (!pairing) return;
    if (Platform.OS === "web") {
      toast.show("Image sharing works on the mobile app — open Pairly in Expo Go", "info");
      return;
    }
    setSharingCard(true);
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" });
      if (!(await Sharing.isAvailableAsync())) {
        toast.show("Sharing is unavailable on this device", "error");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: `${pairing.query} pairings`,
        UTI: "public.png",
      });
    } catch {
      toast.show("Could not create the pairing card", "error");
    } finally {
      setSharingCard(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="pairing-back-button" onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {pairing?.query ?? "Pairing"}
        </Text>
        <Pressable testID="pairing-share-button" onPress={share} style={styles.iconBtn} hitSlop={8}>
          <Feather name="share-2" size={19} color={colors.onSurface} />
        </Pressable>
        <Pressable testID="pairing-favorite-button" onPress={toggleFav} style={styles.iconBtn} hitSlop={8}>
          <Feather
            name="bookmark"
            size={19}
            color={pairing?.is_favorite ? colors.brand : colors.onSurface}
          />
        </Pressable>
      </View>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !pairing ? (
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <Skeleton height={40} width="70%" />
          <Skeleton height={70} />
          <Skeleton height={110} />
          <Skeleton height={110} />
        </View>
      ) : (
        <ScrollView
          testID="pairing-detail-scroll"
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
        >
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pairing.category.toUpperCase()} PAIRINGS</Text>
          </View>
          <Text testID="pairing-headline" style={styles.h1}>
            {pairing.headline || pairing.query}
          </Text>
          {pairing.summary ? <Text style={styles.summary}>{pairing.summary}</Text> : null}
          {pairing.context ? (
            <View style={styles.contextBox}>
              <Feather name="edit-3" size={13} color={colors.muted} />
              <Text style={styles.contextText}>{pairing.context}</Text>
            </View>
          ) : null}

          <View style={styles.hr} />

          {pairing.pairings.map((item, idx) => {
            const open = openIdx === idx;
            return (
              <Pressable
                key={`${item.name}-${idx}`}
                testID={`pairing-item-${idx}`}
                onPress={() => setOpenIdx(open ? null : idx)}
                style={styles.item}
              >
                <View style={styles.itemHead}>
                  <Text style={styles.itemIndex}>{String(idx + 1).padStart(2, "0")}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.category ? <Text style={styles.itemCat}>{item.category}</Text> : null}
                  </View>
                  <Feather name={open ? "minus" : "plus"} size={16} color={colors.muted} />
                </View>
                {open ? (
                  <View style={styles.itemBody}>
                    <Text style={styles.why}>{item.why}</Text>
                    {item.tip ? (
                      <View style={styles.tip}>
                        <Feather name="zap" size={12} color={colors.brand} />
                        <Text style={styles.tipText}>{item.tip}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}

          {pairing.mini_recipe_title ? (
            <View testID="mini-recipe-card" style={styles.recipe}>
              <Text style={styles.recipeKicker}>MINI RECIPE</Text>
              <Text style={styles.recipeTitle}>{pairing.mini_recipe_title}</Text>
              {pairing.mini_recipe_steps.map((s, i) => (
                <View key={i} style={styles.step}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                  <Text style={styles.stepText}>{s}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Pressable testID="whatsapp-share-button" onPress={share} style={styles.waBtn}>
            <Feather name="message-circle" size={17} color={colors.onBrand} />
            <Text style={styles.waText}>Share on WhatsApp</Text>
          </Pressable>

          <Pressable
            testID="share-card-button"
            onPress={shareCard}
            disabled={sharingCard}
            style={[styles.cardBtn, sharingCard && { opacity: 0.6 }]}
          >
            <Feather name="image" size={17} color={colors.onSurface} />
            <Text style={styles.cardBtnText}>
              {sharingCard ? "Creating card…" : "Share as pairing card"}
            </Text>
          </Pressable>

          <View style={styles.offscreen} pointerEvents="none">
            <PairingShareCard ref={cardRef} pairing={pairing} />
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
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.text,
    fontSize: type.base,
    fontWeight: "600",
    color: colors.onSurface,
  },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  badgeText: { fontFamily: fonts.text, fontSize: 10, letterSpacing: 1.3, color: colors.brand, fontWeight: "700" },
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.onSurface },
  summary: {
    fontFamily: fonts.text,
    fontSize: type.lg,
    lineHeight: 25,
    color: colors.muted,
    marginTop: spacing.md,
  },
  contextBox: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  contextText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, color: colors.muted, lineHeight: 19 },
  hr: { height: 1, backgroundColor: colors.borderStrong, marginVertical: spacing.xl },
  item: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.lg },
  itemHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  itemIndex: { fontFamily: fonts.display, fontSize: type.lg, color: colors.brand },
  itemName: { fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface },
  itemCat: {
    fontFamily: fonts.text,
    fontSize: type.sm,
    color: colors.muted,
    marginTop: 2,
    textTransform: "capitalize",
  },
  itemBody: { paddingTop: spacing.md, paddingLeft: spacing.xl + spacing.xs },
  why: { fontFamily: fonts.text, fontSize: type.base, lineHeight: 22, color: colors.onSurface },
  tip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  tipText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, color: colors.brand, lineHeight: 19 },
  recipe: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.xxl,
  },
  recipeKicker: {
    fontFamily: fonts.text,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.brandSecondary,
    fontWeight: "700",
  },
  recipeTitle: {
    fontFamily: fonts.display,
    fontSize: type.xxl,
    color: colors.onSurfaceInverse,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  step: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  stepNum: {
    fontFamily: fonts.display,
    fontSize: type.base,
    color: colors.brandSecondary,
    width: 16,
    paddingTop: 2,
  },
  stepText: {
    flex: 1,
    fontFamily: fonts.text,
    fontSize: type.base,
    lineHeight: 21,
    color: "rgba(250,249,246,0.88)",
  },
  waBtn: {
    marginTop: spacing.xxl,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  waText: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "600", color: colors.onBrand },
  cardBtn: {
    marginTop: spacing.md,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  cardBtnText: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "600", color: colors.onSurface },
  offscreen: { position: "absolute", left: -9999, top: 0, opacity: 0 },
});

import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { colors, fonts, images, radius, spacing, type } from "@/src/theme";

const PERKS = [
  { icon: "infinity" as const, title: "Unlimited pairings", body: "No daily cap — pair as much as you cook." },
  { icon: "layers" as const, title: "Unlimited menu building", body: "Batch pairing and coursed menus for service." },
  { icon: "cpu" as const, title: "Deeper AI reasoning", body: "Longer explanations and richer mini recipes." },
  { icon: "bookmark" as const, title: "Unlimited archive", body: "Keep every pairing you love, forever." },
];

export default function Paywall() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const upgrade = async () => {
    setBusy(true);
    try {
      const order = await api.paypalOrder();
      if (order.approve_url) {
        await WebBrowser.openAuthSessionAsync(order.approve_url, "pairly://paypal-return");
      }
      const res = await api.paypalCapture(order.order_id);
      if (res.is_premium) {
        await refresh();
        toast.show(
          res.mocked ? "Pro unlocked (test mode — PayPal keys not configured)" : "Welcome to Pairly Pro",
          "success",
        );
        router.back();
      }
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Payment could not be completed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Image source={{ uri: images.wine }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} />
        <LinearGradient
          colors={["rgba(31,30,29,0.2)", "rgba(31,30,29,0.8)", colors.surfaceInverse]}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          testID="paywall-close-button"
          onPress={() => router.back()}
          style={[styles.close, { top: insets.top + spacing.sm }]}
          hitSlop={10}
        >
          <Feather name="x" size={20} color={colors.onSurfaceInverse} />
        </Pressable>
        <View style={styles.heroText}>
          <Text style={styles.kicker}>PAIRLY PRO</Text>
          <Text style={styles.h1}>Unlock limitless pairings</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {user?.is_premium ? (
          <View testID="paywall-active-state" style={styles.activeBox}>
            <Feather name="check-circle" size={20} color={colors.success} />
            <Text style={styles.activeText}>You already have Pairly Pro. Cook without limits.</Text>
          </View>
        ) : null}

        {PERKS.map((p) => (
          <View key={p.title} style={styles.perk}>
            <View style={styles.perkIcon}>
              <Feather name={p.icon === "infinity" ? "repeat" : p.icon} size={16} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.perkTitle}>{p.title}</Text>
              <Text style={styles.perkBody}>{p.body}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.fine}>
          One-time unlock via PayPal. Free plan includes 5 AI requests per day.
        </Text>
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.lg }]}>
        <PrimaryButton
          testID="paypal-upgrade-button"
          label={user?.is_premium ? "You're on Pro" : "Unlock Pro — $9.99"}
          icon="credit-card"
          onPress={upgrade}
          loading={busy}
          disabled={user?.is_premium}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 260, backgroundColor: colors.surfaceInverse, justifyContent: "flex-end" },
  close: {
    position: "absolute",
    right: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: "rgba(31,30,29,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { padding: spacing.xl },
  kicker: {
    fontFamily: fonts.text,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.brandSecondary,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.onSurfaceInverse },
  scroll: { padding: spacing.xl, paddingBottom: spacing.lg },
  activeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  activeText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, lineHeight: 20 },
  perk: { flexDirection: "row", gap: spacing.lg, marginBottom: spacing.xl, alignItems: "flex-start" },
  perkIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  perkTitle: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onSurface },
  perkBody: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, marginTop: 2, lineHeight: 20 },
  fine: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, lineHeight: 18 },
  cta: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

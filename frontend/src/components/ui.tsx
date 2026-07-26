import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, fonts, radius, spacing, type } from "@/src/theme";

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  testID,
  icon,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  variant?: "primary" | "secondary" | "ghost";
}) {
  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost";
  const fg = isPrimary ? colors.onBrand : isGhost ? colors.onSurface : colors.brand;
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        isPrimary && { backgroundColor: colors.brand },
        variant === "secondary" && { backgroundColor: colors.brandTertiary },
        isGhost && { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.985 }], opacity: 0.9 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <Feather name={icon} size={17} color={fg} /> : null}
          <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function CategoryChips({
  categories,
  value,
  onChange,
  testIDPrefix,
}: {
  categories: { key: string; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[];
  value: string;
  onChange: (key: string) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={styles.chipRow}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRowContent}
        keyboardShouldPersistTaps="handled"
      >
        {categories.map((c) => {
          const active = c.key === value;
          return (
            <Pressable
              key={c.key}
              testID={`${testIDPrefix}-${c.key}`}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                onChange(c.key);
              }}
              style={[
                styles.chip,
                active
                  ? { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }
                  : { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
              ]}
            >
              <Feather
                name={c.icon}
                size={14}
                color={active ? colors.onSurfaceInverse : colors.muted}
              />
              <Text
                style={[
                  styles.chipLabel,
                  { color: active ? colors.onSurfaceInverse : colors.muted },
                ]}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function EmptyState({
  image,
  title,
  body,
  testID,
}: {
  image: string;
  title: string;
  body: string;
  testID: string;
}) {
  return (
    <View testID={testID} style={styles.empty}>
      <Image source={{ uri: image }} style={styles.emptyImage} contentFit="cover" transition={220} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View testID="error-state" style={styles.empty}>
      <View style={styles.errIcon}>
        <Feather name="wifi-off" size={20} color={colors.brand} />
      </View>
      <Text style={styles.emptyTitle}>Something burned</Text>
      <Text style={styles.emptyBody}>{message}</Text>
      <View style={{ height: spacing.lg }} />
      <PrimaryButton label="Try again" onPress={onRetry} testID="retry-button" variant="secondary" />
    </View>
  );
}

export function Skeleton({ height, width, style }: { height: number; width?: number | string; style?: any }) {
  return <View style={[{ height, width: (width as any) ?? "100%", backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm }, style]} />;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  btnLabel: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "600" },
  chipRow: { height: 56, justifyContent: "center" },
  chipRowContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  chip: {
    height: 36,
    flexShrink: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipLabel: { fontFamily: fonts.text, fontSize: type.base, fontWeight: "500" },
  empty: { alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  emptyImage: {
    width: 148,
    height: 148,
    borderRadius: radius.lg,
    marginBottom: spacing.xl,
    backgroundColor: colors.surfaceTertiary,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: type.xl,
    color: colors.onSurface,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontFamily: fonts.text,
    fontSize: type.base,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 21,
  },
  errIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fonts.text,
    fontSize: type.sm,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
    fontWeight: "600",
  },
});

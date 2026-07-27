import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Notification, api } from "@/src/api";
import { Skeleton } from "@/src/components/ui";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

const ICONS: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  like: "heart",
  comment: "message-square",
  reply: "corner-down-right",
  follow: "user-plus",
  bookmark: "bookmark",
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.notifications();
      setItems(data);
      await api.markNotificationsRead().catch(() => undefined);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          testID="notifications-back-button"
          onPress={() => router.back()}
          style={styles.iconBtn}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Activity</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        {items === null ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        ) : items.length === 0 ? (
          <Text testID="notifications-empty" style={styles.empty}>
            No activity yet. Likes, comments and new followers will land here.
          </Text>
        ) : (
          items.map((n) => (
            <Pressable
              key={n.id}
              testID={`notification-${n.id}`}
              onPress={() => (n.post_id ? router.push(`/post/${n.post_id}`) : undefined)}
              style={[styles.row, !n.read && styles.rowUnread]}
            >
              <View style={styles.icon}>
                <Feather name={ICONS[n.kind] ?? "bell"} size={15} color={colors.brand} />
              </View>
              <Text style={styles.message}>{n.message}</Text>
              {n.post_id ? <Feather name="chevron-right" size={16} color={colors.borderStrong} /> : null}
            </Pressable>
          ))
        )}
      </ScrollView>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  rowUnread: { backgroundColor: colors.brandTertiary },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  message: { flex: 1, fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, lineHeight: 20 },
});

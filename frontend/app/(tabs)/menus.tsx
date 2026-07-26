import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api, Menu } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/components/toast";
import { PrimaryButton, Skeleton } from "@/src/components/ui";
import { menuToText, shareToWhatsApp } from "@/src/share";
import { colors, fonts, images, radius, spacing, type } from "@/src/theme";

export default function MenusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [occasion, setOccasion] = useState("");
  const [itemDraft, setItemDraft] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [menus, setMenus] = useState<Menu[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMenus(await api.menus());
    } catch {
      setMenus([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addItem = () => {
    const v = itemDraft.trim();
    if (!v) return;
    if (items.length >= 8) {
      toast.show("Eight hero ingredients is plenty", "info");
      return;
    }
    setItems((prev) => [...prev, v]);
    setItemDraft("");
  };

  const build = async () => {
    const all = itemDraft.trim() ? [...items, itemDraft.trim()] : items;
    if (all.length === 0) {
      toast.show("Add at least one hero ingredient", "info");
      return;
    }
    setBusy(true);
    try {
      const menu = await api.createMenu({ occasion: occasion.trim(), items: all, notes: notes.trim() });
      setItems([]);
      setItemDraft("");
      setNotes("");
      setOccasion("");
      await load();
      setOpenId(menu.id);
      toast.show("Menu built", "success");
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) router.push("/paywall");
      else toast.show(e instanceof ApiError ? e.message : "Could not build the menu", "error");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const remove = async (id: string) => {
    setMenus((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
    try {
      await api.deleteMenu(id);
    } catch {
      load();
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.kicker}>{user?.role === "chef" ? "CHEF TOOLS" : "BATCH PAIRING"}</Text>
        <Text style={styles.title}>Menu builder</Text>
        <Text style={styles.sub}>Drop in your hero ingredients — get a coursed menu with pairings.</Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 140 + insets.bottom }]}
        bottomOffset={90}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Occasion</Text>
        <TextInput
          testID="menu-occasion-input"
          value={occasion}
          onChangeText={setOccasion}
          placeholder="Autumn tasting menu, wedding canapés…"
          placeholderTextColor="#B3AEA6"
          style={styles.input}
        />

        <Text style={styles.label}>Hero ingredients</Text>
        <View style={styles.addRow}>
          <TextInput
            testID="menu-ingredient-input"
            value={itemDraft}
            onChangeText={setItemDraft}
            placeholder="Add an ingredient"
            placeholderTextColor="#B3AEA6"
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            onSubmitEditing={addItem}
            returnKeyType="done"
          />
          <Pressable testID="menu-add-ingredient-button" onPress={addItem} style={styles.addBtn}>
            <Feather name="plus" size={20} color={colors.onBrand} />
          </Pressable>
        </View>

        {items.length > 0 ? (
          <View style={styles.tagWrap}>
            {items.map((it, idx) => (
              <Pressable
                key={`${it}-${idx}`}
                testID={`menu-ingredient-tag-${idx}`}
                onPress={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                style={styles.tag}
              >
                <Text style={styles.tagText}>{it}</Text>
                <Feather name="x" size={13} color={colors.brand} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Constraints / notes</Text>
        <TextInput
          testID="menu-notes-input"
          value={notes}
          onChangeText={setNotes}
          placeholder="Gluten free, 4 courses, no shellfish…"
          placeholderTextColor="#B3AEA6"
          style={[styles.input, { height: 84, textAlignVertical: "top", paddingTop: spacing.md }]}
          multiline
        />

        <View style={styles.listHead}>
          <Text style={styles.label}>Your menus</Text>
        </View>

        {menus === null ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={72} />
            <Skeleton height={72} />
          </View>
        ) : menus.length === 0 ? (
          <View testID="menus-empty-state" style={styles.empty}>
            <Image source={{ uri: images.chef }} style={styles.emptyImg} contentFit="cover" transition={200} />
            <Text style={styles.emptyTitle}>Start building your next menu</Text>
            <Text style={styles.emptyBody}>
              Add a few ingredients above and Pairly will course them out with beverage pairings.
            </Text>
          </View>
        ) : (
          menus.map((m) => {
            const open = openId === m.id;
            return (
              <View key={m.id} testID={`menu-card-${m.id}`} style={styles.menuCard}>
                <Pressable
                  testID={`menu-toggle-${m.id}`}
                  onPress={() => setOpenId(open ? null : m.id)}
                  style={styles.menuHead}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuTitle}>{m.title}</Text>
                    <Text style={styles.menuMeta}>
                      {m.courses.length} courses{m.occasion ? ` · ${m.occasion}` : ""}
                    </Text>
                  </View>
                  <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
                </Pressable>

                {open ? (
                  <View style={styles.menuBody}>
                    {m.courses.map((c, i) => (
                      <View key={`${m.id}-${i}`} style={styles.course}>
                        <Text style={styles.courseLabel}>{c.course.toUpperCase()}</Text>
                        <Text style={styles.courseDish}>{c.dish}</Text>
                        {c.pairing ? (
                          <View style={styles.pairRow}>
                            <Feather name="droplet" size={12} color={colors.brand} />
                            <Text style={styles.pairText}>{c.pairing}</Text>
                          </View>
                        ) : null}
                        {c.notes ? <Text style={styles.courseNotes}>{c.notes}</Text> : null}
                      </View>
                    ))}
                    {m.wine_notes ? <Text style={styles.wineNotes}>{m.wine_notes}</Text> : null}
                    <View style={styles.menuActions}>
                      <Pressable
                        testID={`menu-share-${m.id}`}
                        onPress={() => shareToWhatsApp(menuToText(m))}
                        style={styles.menuAction}
                      >
                        <Feather name="share-2" size={14} color={colors.onSurface} />
                        <Text style={styles.menuActionText}>Share</Text>
                      </Pressable>
                      <Pressable
                        testID={`menu-delete-${m.id}`}
                        onPress={() => remove(m.id)}
                        style={styles.menuAction}
                      >
                        <Feather name="trash-2" size={14} color={colors.error} />
                        <Text style={[styles.menuActionText, { color: colors.error }]}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: spacing.lg }}>
        <View style={styles.cta}>
          <PrimaryButton
            testID="build-menu-button"
            label={busy ? "Building menu…" : "Build menu"}
            icon="layers"
            onPress={build}
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  kicker: { fontFamily: fonts.text, fontSize: 10, letterSpacing: 2, color: colors.brand, fontWeight: "700" },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface, marginTop: spacing.xs },
  sub: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, marginTop: spacing.xs, lineHeight: 20 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  label: {
    fontFamily: fonts.text,
    fontSize: type.sm,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: colors.muted,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.text,
    fontSize: type.lg,
    color: colors.onSurface,
    marginBottom: spacing.lg,
  },
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  addBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  tagText: { fontFamily: fonts.text, fontSize: type.base, color: colors.brand, fontWeight: "600" },
  listHead: { marginTop: spacing.xxl, marginBottom: spacing.sm },
  empty: { alignItems: "center", paddingVertical: spacing.lg },
  emptyImg: {
    width: "100%",
    height: 150,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceTertiary,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface, marginBottom: spacing.xs },
  emptyBody: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, textAlign: "center", lineHeight: 20 },
  menuCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  menuHead: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  menuTitle: { fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface },
  menuMeta: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  menuBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  course: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  courseLabel: { fontFamily: fonts.text, fontSize: 10, letterSpacing: 1.4, color: colors.muted, fontWeight: "700" },
  courseDish: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onSurface, marginTop: 2 },
  pairRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  pairText: { fontFamily: fonts.text, fontSize: type.base, color: colors.brand, flex: 1 },
  courseNotes: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: spacing.xs, lineHeight: 18 },
  wineNotes: {
    fontFamily: fonts.text,
    fontSize: type.base,
    color: colors.onSurface,
    lineHeight: 21,
    marginTop: spacing.sm,
    fontStyle: "italic",
  },
  menuActions: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.lg },
  menuAction: { flexDirection: "row", alignItems: "center", gap: 6, height: 44 },
  menuActionText: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, fontWeight: "600" },
  cta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api, Usage } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

const DIETS = ["none", "vegetarian", "vegan", "pescatarian", "gluten-free", "keto"];
const SPICE = ["mild", "medium", "hot"];
const CUISINES = ["Italian", "Japanese", "Indian", "Mexican", "French", "Middle Eastern", "Thai", "Nordic"];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser, signOut } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState(user?.role ?? "home_cook");
  const [diet, setDiet] = useState(user?.preferences.diet ?? "none");
  const [spice, setSpice] = useState(user?.preferences.spice ?? "medium");
  const [cuisines, setCuisines] = useState<string[]>(user?.preferences.cuisines ?? []);
  const [avoid, setAvoid] = useState(user?.preferences.avoid ?? "");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api.usage().then(setUsage).catch(() => setUsage(null));
    }, []),
  );

  const save = async () => {
    setBusy(true);
    try {
      const updated = await api.updateProfile({
        name: name.trim() || user?.name,
        role,
        preferences: { diet, spice, cuisines, avoid: avoid.trim() },
      });
      setUser(updated);
      toast.show("Preferences saved", "success");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not save preferences", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.kicker}>YOUR KITCHEN</Text>
        <Text style={styles.title}>Profile</Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
        bottomOffset={spacing.xxl}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name ?? "?").charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.identityName}>{user?.name}</Text>
            <Text style={styles.identityEmail}>{user?.email}</Text>
          </View>
        </View>

        <Pressable
          testID="premium-banner"
          onPress={() => router.push("/paywall")}
          style={[styles.premium, user?.is_premium && { backgroundColor: colors.surfaceInverse }]}
        >
          <Feather
            name={user?.is_premium ? "star" : "zap"}
            size={18}
            color={user?.is_premium ? colors.warning : colors.brand}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.premiumTitle, user?.is_premium && { color: colors.onSurfaceInverse }]}>
              {user?.is_premium ? "Pairly Pro — active" : "Pairly Pro"}
            </Text>
            <Text style={[styles.premiumBody, user?.is_premium && { color: "rgba(250,249,246,0.7)" }]}>
              {user?.is_premium
                ? "Unlimited pairings and menus"
                : usage
                  ? `${usage.used_today} of ${usage.limit} free pairings used today`
                  : "Unlock unlimited pairings"}
            </Text>
          </View>
          {!user?.is_premium ? <Feather name="chevron-right" size={18} color={colors.brand} /> : null}
        </Pressable>

        <Text style={styles.label}>Display name</Text>
        <TextInput
          testID="profile-name-input"
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#B3AEA6"
        />

        <Text style={styles.label}>Cooking mode</Text>
        <View style={styles.row}>
          {[
            { key: "home_cook", label: "Home Cook" },
            { key: "chef", label: "Chef" },
          ].map((r) => (
            <Pressable
              key={r.key}
              testID={`profile-role-${r.key}`}
              onPress={() => setRole(r.key as "home_cook" | "chef")}
              style={[styles.option, role === r.key && styles.optionActive]}
            >
              <Text style={[styles.optionText, role === r.key && styles.optionTextActive]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Diet</Text>
        <View style={styles.wrap}>
          {DIETS.map((d) => (
            <Pressable
              key={d}
              testID={`profile-diet-${d}`}
              onPress={() => setDiet(d)}
              style={[styles.option, diet === d && styles.optionActive]}
            >
              <Text style={[styles.optionText, diet === d && styles.optionTextActive]}>{d}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Spice level</Text>
        <View style={styles.row}>
          {SPICE.map((s) => (
            <Pressable
              key={s}
              testID={`profile-spice-${s}`}
              onPress={() => setSpice(s)}
              style={[styles.option, spice === s && styles.optionActive]}
            >
              <Text style={[styles.optionText, spice === s && styles.optionTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Favourite cuisines</Text>
        <View style={styles.wrap}>
          {CUISINES.map((c) => {
            const active = cuisines.includes(c);
            return (
              <Pressable
                key={c}
                testID={`profile-cuisine-${c.replace(/\s/g, "-").toLowerCase()}`}
                onPress={() =>
                  setCuisines((prev) => (active ? prev.filter((x) => x !== c) : [...prev, c]))
                }
                style={[styles.option, active && styles.optionActive]}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Ingredients to avoid</Text>
        <TextInput
          testID="profile-avoid-input"
          value={avoid}
          onChangeText={setAvoid}
          style={styles.input}
          placeholder="Cilantro, shellfish…"
          placeholderTextColor="#B3AEA6"
        />

        <View style={{ height: spacing.md }} />
        <PrimaryButton testID="profile-save-button" label="Save preferences" onPress={save} loading={busy} />
        <View style={{ height: spacing.md }} />
        <PrimaryButton
          testID="sign-out-button"
          label="Sign out"
          variant="ghost"
          icon="log-out"
          onPress={async () => {
            await signOut();
            router.replace("/(auth)");
          }}
        />
      </KeyboardAwareScrollView>
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
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginBottom: spacing.xl },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.display, fontSize: type.xxl, color: colors.onBrand },
  identityName: { fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface },
  identityEmail: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, marginTop: 2 },
  premium: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  premiumTitle: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onSurface },
  premiumBody: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: 2 },
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
    marginBottom: spacing.xl,
  },
  row: { flexDirection: "row", gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  option: {
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  optionActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  optionText: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, fontWeight: "500", textTransform: "capitalize" },
  optionTextActive: { color: colors.onSurfaceInverse, fontWeight: "600" },
});

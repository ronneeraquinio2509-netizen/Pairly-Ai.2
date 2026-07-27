import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { openAppSettings, pickPhotos } from "@/src/media";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

const DIETS = ["none", "vegetarian", "vegan", "pescatarian", "gluten-free", "keto"];
const SPICE = ["mild", "medium", "hot"];
const CUISINES = ["Filipino", "Italian", "Japanese", "Indian", "Mexican", "French", "Korean", "Thai"];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser, signOut } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [favoriteCuisine, setFavoriteCuisine] = useState(user?.favorite_cuisine ?? "");
  const [website, setWebsite] = useState(user?.website ?? "");
  const [avatar, setAvatar] = useState<string | null>(user?.avatar_b64 ?? null);
  const [cover, setCover] = useState<string | null>(user?.cover_b64 ?? null);
  const [role, setRole] = useState(user?.role ?? "home_cook");
  const [diet, setDiet] = useState(user?.preferences.diet ?? "none");
  const [spice, setSpice] = useState(user?.preferences.spice ?? "medium");
  const [cuisines, setCuisines] = useState<string[]>(user?.preferences.cuisines ?? []);
  const [avoid, setAvoid] = useState(user?.preferences.avoid ?? "");
  const [permBlocked, setPermBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (target: "avatar" | "cover") => {
    const res = await pickPhotos(1);
    if (res.status === "picked" && res.images[0]) {
      if (target === "avatar") setAvatar(res.images[0]);
      else setCover(res.images[0]);
      setPermBlocked(false);
    } else if (res.status === "denied") {
      setPermBlocked(!res.canAskAgain);
      toast.show(
        res.canAskAgain ? "Photo access is needed to change your picture" : "Photo access is blocked",
        "info",
      );
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const updated = await api.updateProfile({
        name: name.trim() || user?.name,
        username: username.trim() || undefined,
        role,
        bio,
        location,
        favorite_cuisine: favoriteCuisine,
        website,
        avatar_b64: avatar,
        cover_b64: cover,
        preferences: { diet, spice, cuisines, avoid: avoid.trim() },
      });
      setUser(updated);
      toast.show("Profile saved", "success");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not save your profile", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="settings-back-button" onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile & preferences</Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
        bottomOffset={spacing.xxl}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable testID="settings-cover-picker" onPress={() => pick("cover")} style={styles.coverPick}>
          {cover ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${cover}` }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : null}
          <View style={styles.coverLabel}>
            <Feather name="image" size={14} color={colors.onSurfaceInverse} />
            <Text style={styles.coverLabelText}>{cover ? "Change cover" : "Add cover photo"}</Text>
          </View>
        </Pressable>

        <Pressable testID="settings-avatar-picker" onPress={() => pick("avatar")} style={styles.avatarPick}>
          {avatar ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${avatar}` }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Feather name="camera" size={18} color={colors.onBrand} />
            </View>
          )}
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </Pressable>

        {permBlocked ? (
          <Pressable testID="settings-open-settings" onPress={openAppSettings} style={styles.settingsBtn}>
            <Feather name="settings" size={14} color={colors.brand} />
            <Text style={styles.settingsBtnText}>Open Settings to allow photo access</Text>
          </Pressable>
        ) : null}

        <Text style={styles.label}>Display name</Text>
        <TextInput testID="settings-name-input" value={name} onChangeText={setName} style={styles.input} />

        <Text style={styles.label}>Username</Text>
        <TextInput
          testID="settings-username-input"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          style={styles.input}
          placeholder="pairlycook"
          placeholderTextColor="#B3AEA6"
        />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          testID="settings-bio-input"
          value={bio}
          onChangeText={setBio}
          multiline
          style={[styles.input, { minHeight: 88, textAlignVertical: "top", paddingTop: spacing.md }]}
          placeholder="Weeknight cook, sourdough obsessive"
          placeholderTextColor="#B3AEA6"
        />

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              testID="settings-location-input"
              value={location}
              onChangeText={setLocation}
              style={styles.input}
              placeholder="Manila"
              placeholderTextColor="#B3AEA6"
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Favourite cuisine</Text>
            <TextInput
              testID="settings-cuisine-input"
              value={favoriteCuisine}
              onChangeText={setFavoriteCuisine}
              style={styles.input}
              placeholder="Filipino"
              placeholderTextColor="#B3AEA6"
            />
          </View>
        </View>

        <Text style={styles.label}>Website</Text>
        <TextInput
          testID="settings-website-input"
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
          style={styles.input}
          placeholder="https://"
          placeholderTextColor="#B3AEA6"
        />

        <Text style={styles.label}>Cooking mode</Text>
        <View style={styles.wrap}>
          {[
            { key: "home_cook", label: "Home Cook" },
            { key: "chef", label: "Chef" },
          ].map((r) => (
            <Pressable
              key={r.key}
              testID={`settings-role-${r.key}`}
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
              testID={`settings-diet-${d}`}
              onPress={() => setDiet(d)}
              style={[styles.option, diet === d && styles.optionActive]}
            >
              <Text style={[styles.optionText, diet === d && styles.optionTextActive]}>{d}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Spice level</Text>
        <View style={styles.wrap}>
          {SPICE.map((s) => (
            <Pressable
              key={s}
              testID={`settings-spice-${s}`}
              onPress={() => setSpice(s)}
              style={[styles.option, spice === s && styles.optionActive]}
            >
              <Text style={[styles.optionText, spice === s && styles.optionTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Cuisines you cook most</Text>
        <View style={styles.wrap}>
          {CUISINES.map((c) => {
            const active = cuisines.includes(c);
            return (
              <Pressable
                key={c}
                testID={`settings-pref-cuisine-${c.toLowerCase()}`}
                onPress={() => setCuisines((prev) => (active ? prev.filter((x) => x !== c) : [...prev, c]))}
                style={[styles.option, active && styles.optionActive]}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Ingredients to avoid</Text>
        <TextInput
          testID="settings-avoid-input"
          value={avoid}
          onChangeText={setAvoid}
          style={styles.input}
          placeholder="Cilantro, shellfish…"
          placeholderTextColor="#B3AEA6"
        />

        <PrimaryButton testID="settings-save-button" label="Save profile" onPress={save} loading={busy} />
        <View style={{ height: spacing.md }} />
        <PrimaryButton
          testID="settings-premium-button"
          label={user?.is_premium ? "Pairly Pro — active" : "Upgrade to Pairly Pro"}
          variant="secondary"
          icon="star"
          onPress={() => router.push("/paywall")}
        />
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: type.lg, fontWeight: "600", color: colors.onSurface },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  coverPick: {
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
    justifyContent: "flex-end",
    alignItems: "flex-start",
  },
  coverLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(31,30,29,0.6)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    margin: spacing.md,
    borderRadius: radius.sm,
  },
  coverLabelText: { fontFamily: fonts.text, fontSize: type.sm, color: colors.onSurfaceInverse, fontWeight: "600" },
  avatarPick: { alignItems: "center", marginTop: -28, marginBottom: spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surfaceTertiary,
  },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  avatarHint: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: spacing.sm },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  settingsBtnText: { fontFamily: fonts.text, fontSize: type.base, color: colors.brand, fontWeight: "600" },
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
    minHeight: 52,
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
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
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
  optionText: {
    fontFamily: fonts.text,
    fontSize: type.base,
    color: colors.muted,
    textTransform: "capitalize",
  },
  optionTextActive: { color: colors.onSurfaceInverse, fontWeight: "600" },
});

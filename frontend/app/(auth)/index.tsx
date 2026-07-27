import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { colors, fonts, images, radius, spacing, type } from "@/src/theme";

const ROLES = [
  {
    key: "home_cook",
    title: "Home Cook",
    body: "Everyday pairings with simple, friendly guidance",
    icon: "home" as const,
  },
  {
    key: "chef",
    title: "Chef",
    body: "Technical pairings, menu building and batch tools",
    icon: "award" as const,
  },
];

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("home_cook");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password to continue");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Tell us what to call you");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") await signUp(name.trim(), email, password, role);
      else await signIn(email, password);
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not reach Pairly. Check your connection.";
      setError(msg);
      toast.show(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Image source={{ uri: images.auth }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
        <LinearGradient
          colors={["rgba(31,30,29,0.25)", "rgba(31,30,29,0.75)", colors.surfaceInverse]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xl }]}>
          <View style={styles.brandRow}>
            <Feather name="git-merge" size={18} color={colors.brandSecondary} />
            <Text style={styles.brandName}>PAIRLY</Text>
          </View>
          <Text style={styles.heroTitle}>What goes{"\n"}with what.</Text>
          <Text style={styles.heroSub}>
            Smart pairings, reasons that make sense, and a mini recipe for every idea.
          </Text>
        </View>
      </View>

      <KeyboardAwareScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + spacing.xxl }]}
        bottomOffset={spacing.xxl}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.tabs}>
          {(["signup", "login"] as const).map((m) => (
            <Pressable
              key={m}
              testID={`auth-tab-${m}`}
              onPress={() => {
                setMode(m);
                setError("");
              }}
              style={[styles.tab, mode === m && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, mode === m && styles.tabLabelActive]}>
                {m === "signup" ? "Create account" : "Sign in"}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === "signup" ? (
          <>
            <Text style={styles.label}>Your name</Text>
            <TextInput
              testID="auth-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Amara"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </>
        ) : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          testID="auth-email-input"
          value={email}
          onChangeText={setEmail}
          placeholder="you@kitchen.com"
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          testID="auth-password-input"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          placeholderTextColor={colors.muted}
          style={styles.input}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        {mode === "signup" ? (
          <>
            <Text style={[styles.label, { marginTop: spacing.xl }]}>I cook as a…</Text>
            <View style={styles.roleWrap}>
              {ROLES.map((r) => {
                const active = role === r.key;
                return (
                  <Pressable
                    key={r.key}
                    testID={`auth-role-${r.key}`}
                    onPress={() => setRole(r.key)}
                    style={[styles.roleCard, active && styles.roleCardActive]}
                  >
                    <View style={[styles.roleIcon, active && { backgroundColor: colors.brand }]}>
                      <Feather name={r.icon} size={16} color={active ? colors.onBrand : colors.brand} />
                    </View>
                    <Text style={styles.roleTitle}>{r.title}</Text>
                    <Text style={styles.roleBody}>{r.body}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {error ? (
          <Text testID="auth-error-text" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={{ height: spacing.xl }} />
        <PrimaryButton
          testID="auth-submit-button"
          label={mode === "signup" ? "Start pairing" : "Sign in"}
          onPress={submit}
          loading={busy}
        />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 300, backgroundColor: colors.surfaceInverse, justifyContent: "flex-end" },
  heroContent: { padding: spacing.xl, paddingBottom: spacing.xl },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  brandName: {
    fontFamily: fonts.text,
    fontSize: type.sm,
    letterSpacing: 2.4,
    color: colors.onSurfaceInverse,
    fontWeight: "700",
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 42,
    color: colors.onSurfaceInverse,
    marginBottom: spacing.sm,
  },
  heroSub: {
    fontFamily: fonts.text,
    fontSize: type.base,
    lineHeight: 20,
    color: "rgba(250,249,246,0.78)",
    maxWidth: 320,
  },
  sheet: { flex: 1, backgroundColor: colors.surface },
  sheetContent: { padding: spacing.xl },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing.xl,
  },
  tab: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.surfaceSecondary },
  tabLabel: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, fontWeight: "500" },
  tabLabelActive: { color: colors.onSurface, fontWeight: "600" },
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
  roleWrap: { flexDirection: "row", gap: spacing.md },
  roleCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  roleCardActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  roleIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  roleTitle: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onSurface, marginBottom: 4 },
  roleBody: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, lineHeight: 17 },
  error: {
    fontFamily: fonts.text,
    fontSize: type.base,
    color: colors.error,
    marginTop: spacing.lg,
  },
});

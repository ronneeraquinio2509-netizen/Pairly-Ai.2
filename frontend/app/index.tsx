import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/src/auth-context";
import { colors, fonts, spacing, type } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View testID="boot-loading" style={styles.container}>
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.text}>Preparing your kitchen…</Text>
      </View>
    );
  }

  return <Redirect href={user ? "/(tabs)" : "/(auth)"} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  text: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
});

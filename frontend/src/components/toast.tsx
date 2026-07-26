import Feather from "@expo/vector-icons/Feather";
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radius, spacing, type } from "@/src/theme";

type ToastKind = "success" | "error" | "info";
type ToastCtx = { show: (message: string, kind?: ToastKind) => void };

const Ctx = createContext<ToastCtx | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<{ message: string; kind: ToastKind } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      if (timer.current) clearTimeout(timer.current);
      setState({ message, kind });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
          setState(null),
        );
      }, 3200);
    },
    [opacity],
  );

  const value = useMemo(() => ({ show }), [show]);

  const icon = state?.kind === "success" ? "check-circle" : state?.kind === "error" ? "alert-circle" : "info";

  return (
    <Ctx.Provider value={value}>
      {children}
      {state ? (
        <Animated.View
          testID="app-toast"
          style={[styles.wrap, { top: insets.top + spacing.sm, opacity, pointerEvents: "none" }]}
        >
          <Feather name={icon} size={16} color={colors.onSurfaceInverse} />
          <Text style={styles.text} numberOfLines={3}>
            {state.message}
          </Text>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    color: colors.onSurfaceInverse,
    fontFamily: fonts.text,
    fontSize: type.base,
    lineHeight: 20,
  },
});

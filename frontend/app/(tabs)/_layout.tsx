import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";

import { colors, fonts, radius, spacing, type } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: "#A9A59E",
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: { paddingTop: spacing.sm },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarButtonTestID: "tab-home",
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarButtonTestID: "tab-search",
          tabBarIcon: ({ color }) => <Feather name="search" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          tabBarButtonTestID: "tab-create",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.createBtn, focused && { backgroundColor: colors.surfaceInverse }]}>
              <Feather name="plus" size={18} color={colors.onBrand} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: "AI",
          tabBarButtonTestID: "tab-ai",
          tabBarIcon: ({ color }) => <Feather name="git-merge" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarButtonTestID: "tab-profile",
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surfaceSecondary,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: Platform.select({ ios: 84, default: 64 }),
    paddingBottom: Platform.select({ ios: spacing.xl, default: spacing.sm }),
  },
  tabLabel: { fontFamily: fonts.text, fontSize: type.sm, fontWeight: "600" },
  createBtn: {
    width: 34,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});

import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Author, Post, api } from "@/src/api";
import { PostCard } from "@/src/components/post-card";
import { useToast } from "@/src/components/toast";
import { CategoryChips, Skeleton } from "@/src/components/ui";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

const TYPES = [
  { key: "all", label: "All", icon: "grid" as const },
  { key: "recipes", label: "Recipes", icon: "book-open" as const },
  { key: "posts", label: "Posts", icon: "image" as const },
  { key: "users", label: "Cooks", icon: "users" as const },
  { key: "pairings", label: "My pairings", icon: "git-merge" as const },
];

const SORTS = [
  { key: "latest", label: "Latest" },
  { key: "likes", label: "Most liked" },
  { key: "saves", label: "Most saved" },
  { key: "trending", label: "Trending" },
];

const CUISINES = ["Filipino", "Japanese", "Italian", "French", "Korean", "Indian", "Thai", "Mexican"];
const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"];
const DIETS = ["Vegetarian", "Vegan", "Keto", "High Protein", "Low Carb", "Gluten Free"];
const TIMES = [
  { key: 0, label: "Any time" },
  { key: 20, label: "≤ 20 min" },
  { key: 45, label: "≤ 45 min" },
  { key: 90, label: "≤ 90 min" },
];

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("latest");
  const [cuisine, setCuisine] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [diet, setDiet] = useState("");
  const [maxTime, setMaxTime] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState<{ users: Author[]; posts: Post[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (overrides: Record<string, string | number> = {}) => {
      setBusy(true);
      try {
        const data = await api.search({
          q,
          type,
          sort,
          cuisine,
          difficulty,
          diet,
          max_time: maxTime,
          ...overrides,
        });
        setResults({ users: data.users, posts: data.posts });
      } catch {
        toast.show("Search failed. Try again.", "error");
      } finally {
        setBusy(false);
      }
    },
    [q, type, sort, cuisine, difficulty, diet, maxTime, toast],
  );

  const activeFilters = [cuisine, difficulty, diet, maxTime ? `${maxTime}m` : ""].filter(Boolean).length;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.searchRow}>
          <Feather name="search" size={17} color={colors.muted} />
          <TextInput
            testID="search-input"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => run()}
            placeholder="Recipes, cooks, ingredients, #tags"
            placeholderTextColor="#B3AEA6"
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {q ? (
            <Pressable testID="search-clear" onPress={() => setQ("")} hitSlop={8}>
              <Feather name="x" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <CategoryChips
          categories={TYPES}
          value={type}
          onChange={(k) => {
            setType(k);
            run({ type: k });
          }}
          testIDPrefix="search-type"
        />
        <View style={styles.filterBar}>
          <Pressable
            testID="search-filters-toggle"
            onPress={() => setShowFilters((v) => !v)}
            style={styles.filterBtn}
          >
            <Feather name="sliders" size={14} color={colors.onSurface} />
            <Text style={styles.filterBtnText}>
              Filters{activeFilters ? ` · ${activeFilters}` : ""}
            </Text>
          </Pressable>
          <Pressable testID="search-run-button" onPress={() => run()} style={styles.searchBtn}>
            <Text style={styles.searchBtnText}>Search</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {showFilters ? (
          <View testID="search-filters-panel" style={styles.panel}>
            <Text style={styles.panelLabel}>Sort</Text>
            <View style={styles.wrap}>
              {SORTS.map((s) => (
                <Pressable
                  key={s.key}
                  testID={`search-sort-${s.key}`}
                  onPress={() => setSort(s.key)}
                  style={[styles.option, sort === s.key && styles.optionActive]}
                >
                  <Text style={[styles.optionText, sort === s.key && styles.optionTextActive]}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.panelLabel}>Cuisine</Text>
            <View style={styles.wrap}>
              {CUISINES.map((c) => (
                <Pressable
                  key={c}
                  testID={`search-cuisine-${c.toLowerCase()}`}
                  onPress={() => setCuisine(cuisine === c ? "" : c)}
                  style={[styles.option, cuisine === c && styles.optionActive]}
                >
                  <Text style={[styles.optionText, cuisine === c && styles.optionTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.panelLabel}>Difficulty</Text>
            <View style={styles.wrap}>
              {DIFFICULTIES.map((d) => (
                <Pressable
                  key={d}
                  testID={`search-difficulty-${d.toLowerCase()}`}
                  onPress={() => setDifficulty(difficulty === d ? "" : d)}
                  style={[styles.option, difficulty === d && styles.optionActive]}
                >
                  <Text style={[styles.optionText, difficulty === d && styles.optionTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.panelLabel}>Diet</Text>
            <View style={styles.wrap}>
              {DIETS.map((d) => (
                <Pressable
                  key={d}
                  testID={`search-diet-${d.replace(/\s/g, "-").toLowerCase()}`}
                  onPress={() => setDiet(diet === d ? "" : d)}
                  style={[styles.option, diet === d && styles.optionActive]}
                >
                  <Text style={[styles.optionText, diet === d && styles.optionTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.panelLabel}>Total time</Text>
            <View style={styles.wrap}>
              {TIMES.map((t) => (
                <Pressable
                  key={t.key}
                  testID={`search-time-${t.key}`}
                  onPress={() => setMaxTime(t.key)}
                  style={[styles.option, maxTime === t.key && styles.optionActive]}
                >
                  <Text style={[styles.optionText, maxTime === t.key && styles.optionTextActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {busy ? (
          <View style={{ gap: spacing.lg }}>
            <Skeleton height={72} />
            <Skeleton height={240} />
          </View>
        ) : results === null ? (
          <Text testID="search-hint" style={styles.hint}>
            Search recipes, cooks and ingredients — or open Filters to browse by cuisine, diet and time.
          </Text>
        ) : (
          <>
            {results.users.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>COOKS</Text>
                {results.users.map((u) => (
                  <Pressable
                    key={u.id}
                    testID={`search-user-${u.id}`}
                    onPress={() => router.push(`/user/${u.id}`)}
                    style={styles.userRow}
                  >
                    {u.avatar_b64 ? (
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${u.avatar_b64}` }}
                        style={styles.avatar}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarLetter}>{u.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <Text style={styles.userMeta}>
                        @{u.username} · {u.role === "chef" ? "Chef" : "Home cook"}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.borderStrong} />
                  </Pressable>
                ))}
                <View style={{ height: spacing.xl }} />
              </>
            ) : null}

            {results.posts.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>POSTS & RECIPES</Text>
                <View style={{ height: spacing.md }} />
                {results.posts.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </>
            ) : results.users.length === 0 ? (
              <Text testID="search-no-results" style={styles.hint}>
                Nothing matched that. Try a different ingredient or clear your filters.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  searchInput: { flex: 1, fontFamily: fonts.text, fontSize: type.lg, color: colors.onSurface },
  filterBar: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  filterBtnText: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, fontWeight: "600" },
  searchBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: { fontFamily: fonts.text, fontSize: type.base, color: colors.onBrand, fontWeight: "600" },
  panel: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  panelLabel: {
    fontFamily: fonts.text,
    fontSize: type.sm,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: colors.muted,
    fontWeight: "600",
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  option: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  optionActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  optionText: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  optionTextActive: { color: colors.onSurfaceInverse, fontWeight: "600" },
  hint: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, lineHeight: 21 },
  sectionLabel: {
    fontFamily: fonts.text,
    fontSize: type.sm,
    letterSpacing: 1.3,
    color: colors.muted,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  avatarLetter: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onBrand },
  userName: { fontFamily: fonts.display, fontSize: type.lg, color: colors.onSurface },
  userMeta: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, marginTop: 1 },
});

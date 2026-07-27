import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, Recipe, api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { shareToWhatsApp } from "@/src/share";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

const DIETS = ["Vegetarian", "Vegan", "Keto", "High Protein", "Low Carb", "Mediterranean", "Gluten Free"];
const BUDGETS = ["Budget", "Mid-range", "Premium"];
const TIMES = ["15 minutes", "30 minutes", "45 minutes", "1 hour+"];
const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"];

function recipeToText(r: Recipe): string {
  return [
    `🍳 ${r.title}`,
    r.description,
    `\n${r.cuisine} · ${r.difficulty} · ${r.prep_time_min + r.cook_time_min} min · serves ${r.servings}`,
    "\nIngredients:",
    ...r.ingredients.map((i) => `• ${i}`),
    "\nMethod:",
    ...r.instructions.map((s, i) => `${i + 1}. ${s}`),
    r.nutrition.calories ? `\nNutrition: ${r.nutrition.calories}, ${r.nutrition.protein} protein` : "",
    r.drink_pairing ? `\nDrink: ${r.drink_pairing}` : "",
    "\nGenerated with Pairly",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function RecipeGeneratorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useAuth();

  const [draft, setDraft] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [cuisine, setCuisine] = useState("");
  const [diet, setDiet] = useState("");
  const [budget, setBudget] = useState("");
  const [time, setTime] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [calories, setCalories] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [publishing, setPublishing] = useState(false);

  const addIngredient = () => {
    const v = draft.trim();
    if (!v) return;
    setIngredients((prev) => [...prev, v].slice(0, 12));
    setDraft("");
  };

  const generate = async () => {
    const all = draft.trim() ? [...ingredients, draft.trim()] : ingredients;
    if (all.length === 0 && !goal.trim()) {
      toast.show("Add an ingredient or describe your goal", "info");
      return;
    }
    setBusy(true);
    try {
      const res = await api.generateRecipe({
        ingredients: all,
        cuisine,
        diet,
        budget,
        cooking_time: time,
        difficulty,
        calories,
        goal: goal.trim(),
      });
      setRecipe(res.recipe);
      setDraft("");
      toast.show("Recipe ready", "success");
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) router.push("/paywall");
      else toast.show(e instanceof ApiError ? e.message : "Could not generate a recipe", "error");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const publish = async () => {
    if (!recipe) return;
    setPublishing(true);
    try {
      const post = await api.createPost({
        kind: "recipe",
        caption: recipe.description,
        hashtags: recipe.tags,
        images: [],
        recipe,
      });
      toast.show("Published to the feed", "success");
      router.push(`/post/${post.id}`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not publish", "error");
    } finally {
      setPublishing(false);
    }
  };

  const chipGroup = (
    label: string,
    options: string[],
    value: string,
    onChange: (v: string) => void,
    prefix: string,
  ) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wrap}>
        {options.map((o) => (
          <Pressable
            key={o}
            testID={`${prefix}-${o.replace(/[\s+]/g, "-").toLowerCase()}`}
            onPress={() => onChange(value === o ? "" : o)}
            style={[styles.option, value === o && styles.optionActive]}
          >
            <Text style={[styles.optionText, value === o && styles.optionTextActive]}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="recipe-back-button" onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Recipe generator</Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 130 + insets.bottom }]}
        bottomOffset={90}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>What's in your kitchen?</Text>
        <View style={styles.addRow}>
          <TextInput
            testID="recipe-ingredient-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Add an ingredient"
            placeholderTextColor="#B3AEA6"
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            onSubmitEditing={addIngredient}
            returnKeyType="done"
          />
          <Pressable testID="recipe-add-ingredient-button" onPress={addIngredient} style={styles.addBtn}>
            <Feather name="plus" size={20} color={colors.onBrand} />
          </Pressable>
        </View>
        {ingredients.length > 0 ? (
          <View style={[styles.wrap, { marginTop: spacing.md }]}>
            {ingredients.map((i, idx) => (
              <Pressable
                key={`${i}-${idx}`}
                testID={`recipe-ingredient-tag-${idx}`}
                onPress={() => setIngredients((prev) => prev.filter((_, x) => x !== idx))}
                style={styles.tag}
              >
                <Text style={styles.tagText}>{i}</Text>
                <Feather name="x" size={13} color={colors.brand} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={{ height: spacing.xl }} />
        <Text style={styles.label}>Cuisine</Text>
        <TextInput
          testID="recipe-cuisine-input"
          value={cuisine}
          onChangeText={setCuisine}
          placeholder="Filipino, Japanese, Italian…"
          placeholderTextColor="#B3AEA6"
          style={styles.input}
        />

        {chipGroup("Diet", DIETS, diet, setDiet, "recipe-diet")}
        <View style={{ height: spacing.lg }} />
        {chipGroup("Budget", BUDGETS, budget, setBudget, "recipe-budget")}
        <View style={{ height: spacing.lg }} />
        {chipGroup("Cooking time", TIMES, time, setTime, "recipe-time")}
        <View style={{ height: spacing.lg }} />
        {chipGroup("Difficulty", DIFFICULTIES, difficulty, setDifficulty, "recipe-difficulty")}

        <View style={{ height: spacing.lg }} />
        <Text style={styles.label}>Calorie target (optional)</Text>
        <TextInput
          testID="recipe-calories-input"
          value={calories}
          onChangeText={setCalories}
          placeholder="600"
          placeholderTextColor="#B3AEA6"
          keyboardType="number-pad"
          style={styles.input}
        />

        <Text style={styles.label}>Goal</Text>
        <TextInput
          testID="recipe-goal-input"
          value={goal}
          onChangeText={setGoal}
          placeholder="Quick weeknight meal, impress guests…"
          placeholderTextColor="#B3AEA6"
          style={styles.input}
        />

        {recipe ? (
          <View testID="generated-recipe-card" style={styles.result}>
            <Text style={styles.resultKicker}>GENERATED RECIPE</Text>
            <Text style={styles.resultTitle}>{recipe.title}</Text>
            <Text style={styles.resultDesc}>{recipe.description}</Text>
            <View style={styles.metaRow}>
              {[
                recipe.cuisine,
                recipe.difficulty,
                `${recipe.prep_time_min + recipe.cook_time_min} min`,
                `serves ${recipe.servings}`,
                recipe.nutrition.calories,
              ]
                .filter(Boolean)
                .map((m) => (
                  <View key={m} style={styles.metaChip}>
                    <Text style={styles.metaChipText}>{m}</Text>
                  </View>
                ))}
            </View>

            <Text style={styles.sectionLabel}>INGREDIENTS</Text>
            {recipe.ingredients.map((i, idx) => (
              <Text key={idx} style={styles.line}>
                · {i}
              </Text>
            ))}

            <Text style={styles.sectionLabel}>METHOD</Text>
            {recipe.instructions.map((s, idx) => (
              <View key={idx} style={styles.step}>
                <Text style={styles.stepNum}>{idx + 1}</Text>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}

            {recipe.nutrition.calories ? (
              <>
                <Text style={styles.sectionLabel}>NUTRITION (PER SERVING)</Text>
                <Text style={styles.line}>
                  {[
                    recipe.nutrition.calories,
                    recipe.nutrition.protein && `${recipe.nutrition.protein} protein`,
                    recipe.nutrition.carbs && `${recipe.nutrition.carbs} carbs`,
                    recipe.nutrition.fat && `${recipe.nutrition.fat} fat`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </>
            ) : null}

            {recipe.shopping_list.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>SHOPPING LIST</Text>
                {recipe.shopping_list.map((s, idx) => (
                  <Text key={idx} style={styles.line}>
                    □ {s}
                  </Text>
                ))}
              </>
            ) : null}

            {recipe.drink_pairing || recipe.dessert_pairing ? (
              <>
                <Text style={styles.sectionLabel}>PAIRINGS</Text>
                {recipe.drink_pairing ? <Text style={styles.line}>🥂 {recipe.drink_pairing}</Text> : null}
                {recipe.dessert_pairing ? <Text style={styles.line}>🍮 {recipe.dessert_pairing}</Text> : null}
              </>
            ) : null}

            <View style={{ height: spacing.lg }} />
            <PrimaryButton
              testID="publish-recipe-button"
              label="Publish to feed"
              icon="send"
              onPress={publish}
              loading={publishing}
              variant="secondary"
            />
            <View style={{ height: spacing.sm }} />
            <PrimaryButton
              testID="share-recipe-button"
              label="Share on WhatsApp"
              icon="share-2"
              variant="ghost"
              onPress={() => shareToWhatsApp(recipeToText(recipe))}
            />
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: spacing.lg }}>
        <View style={styles.cta}>
          <PrimaryButton
            testID="generate-recipe-button"
            label={busy ? "Developing recipe…" : "Generate recipe"}
            icon="book-open"
            onPress={generate}
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: type.xl, color: colors.onSurface },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
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
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  addBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
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
  option: {
    height: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  optionActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  optionText: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted },
  optionTextActive: { color: colors.onSurfaceInverse, fontWeight: "600" },
  result: {
    marginTop: spacing.xxl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  resultKicker: {
    fontFamily: fonts.text,
    fontSize: 10,
    letterSpacing: 1.8,
    color: colors.brand,
    fontWeight: "700",
  },
  resultTitle: { fontFamily: fonts.display, fontSize: type.xxl, color: colors.onSurface, marginTop: spacing.xs },
  resultDesc: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, lineHeight: 21, marginTop: spacing.sm },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  metaChip: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  metaChipText: { fontFamily: fonts.text, fontSize: type.sm, color: colors.muted, fontWeight: "500" },
  sectionLabel: {
    fontFamily: fonts.text,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.brand,
    fontWeight: "700",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  line: { fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, lineHeight: 22 },
  step: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm },
  stepNum: { fontFamily: fonts.display, fontSize: type.base, color: colors.brand, width: 16 },
  stepText: { flex: 1, fontFamily: fonts.text, fontSize: type.base, color: colors.onSurface, lineHeight: 21 },
  cta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

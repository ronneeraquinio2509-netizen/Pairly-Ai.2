import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/src/api";
import { useToast } from "@/src/components/toast";
import { PrimaryButton } from "@/src/components/ui";
import { openAppSettings, pickPhotos } from "@/src/media";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

const KINDS = [
  { key: "photo", label: "Photo post", icon: "image" as const },
  { key: "recipe", label: "Recipe", icon: "book-open" as const },
];

const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"];

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [kind, setKind] = useState("photo");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [imagesB64, setImagesB64] = useState<string[]>([]);
  const [permBlocked, setPermBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  // recipe fields
  const [title, setTitle] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [difficulty, setDifficulty] = useState("Beginner");
  const [prep, setPrep] = useState("");
  const [cook, setCook] = useState("");
  const [servings, setServings] = useState("2");
  const [ingredients, setIngredients] = useState("");
  const [steps, setSteps] = useState("");
  const [calories, setCalories] = useState("");

  const addPhotos = async () => {
    const res = await pickPhotos(4 - imagesB64.length);
    if (res.status === "picked") {
      setImagesB64((prev) => [...prev, ...res.images].slice(0, 4));
      setPermBlocked(false);
    } else if (res.status === "denied") {
      setPermBlocked(!res.canAskAgain);
      toast.show(
        res.canAskAgain
          ? "Photo access is needed to add pictures to your post"
          : "Photo access is blocked — open Settings to allow it",
        "info",
      );
    }
  };

  const submit = async () => {
    if (kind === "recipe" && !title.trim()) {
      toast.show("Give your recipe a title", "info");
      return;
    }
    if (kind === "photo" && imagesB64.length === 0 && !caption.trim()) {
      toast.show("Add a photo or write a caption", "info");
      return;
    }
    setBusy(true);
    try {
      const post = await api.createPost({
        kind,
        caption: caption.trim(),
        hashtags: tags
          .split(/[\s,]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        images: imagesB64,
        recipe:
          kind === "recipe"
            ? {
                title: title.trim(),
                description: caption.trim(),
                cuisine: cuisine.trim(),
                difficulty,
                prep_time_min: Number(prep) || 0,
                cook_time_min: Number(cook) || 0,
                servings: Number(servings) || 2,
                ingredients: ingredients.split("\n").map((l) => l.trim()).filter(Boolean),
                instructions: steps.split("\n").map((l) => l.trim()).filter(Boolean),
                nutrition: { calories: calories.trim(), protein: "", carbs: "", fat: "" },
                tags: [],
              }
            : null,
      });
      setCaption("");
      setTags("");
      setImagesB64([]);
      setTitle("");
      setIngredients("");
      setSteps("");
      toast.show("Posted to the feed", "success");
      router.push(`/post/${post.id}`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Could not publish your post", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.kicker}>SHARE WITH THE COMMUNITY</Text>
        <Text style={styles.title}>Create</Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 130 + insets.bottom }]}
        bottomOffset={90}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.kindRow}>
          {KINDS.map((k) => (
            <Pressable
              key={k.key}
              testID={`create-kind-${k.key}`}
              onPress={() => setKind(k.key)}
              style={[styles.kindCard, kind === k.key && styles.kindCardActive]}
            >
              <Feather name={k.icon} size={16} color={kind === k.key ? colors.brand : colors.muted} />
              <Text style={[styles.kindLabel, kind === k.key && { color: colors.onSurface }]}>{k.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.photoRow}>
          {imagesB64.map((img, idx) => (
            <View key={idx} style={styles.thumbWrap}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${img}` }}
                style={styles.thumb}
                contentFit="cover"
              />
              <Pressable
                testID={`create-remove-photo-${idx}`}
                onPress={() => setImagesB64((prev) => prev.filter((_, i) => i !== idx))}
                style={styles.thumbRemove}
                hitSlop={6}
              >
                <Feather name="x" size={12} color={colors.onSurfaceInverse} />
              </Pressable>
            </View>
          ))}
          {imagesB64.length < 4 ? (
            <Pressable testID="create-add-photo-button" onPress={addPhotos} style={styles.addPhoto}>
              <Feather name="camera" size={18} color={colors.brand} />
              <Text style={styles.addPhotoText}>Add photo</Text>
            </Pressable>
          ) : null}
        </View>

        {permBlocked ? (
          <Pressable testID="create-open-settings" onPress={openAppSettings} style={styles.settingsBtn}>
            <Feather name="settings" size={14} color={colors.brand} />
            <Text style={styles.settingsText}>Open Settings to allow photo access</Text>
          </Pressable>
        ) : null}

        {kind === "recipe" ? (
          <>
            <Text style={styles.label}>Recipe title</Text>
            <TextInput
              testID="create-recipe-title"
              value={title}
              onChangeText={setTitle}
              placeholder="Lemon-fennel braised chicken"
              placeholderTextColor="#B3AEA6"
              style={styles.input}
            />
          </>
        ) : null}

        <Text style={styles.label}>{kind === "recipe" ? "Description" : "Caption"}</Text>
        <TextInput
          testID="create-caption-input"
          value={caption}
          onChangeText={setCaption}
          placeholder={kind === "recipe" ? "What makes this dish work?" : "Tell the story of this plate…"}
          placeholderTextColor="#B3AEA6"
          style={[styles.input, styles.multiline]}
          multiline
        />

        {kind === "recipe" ? (
          <>
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Cuisine</Text>
                <TextInput
                  testID="create-cuisine-input"
                  value={cuisine}
                  onChangeText={setCuisine}
                  placeholder="Filipino"
                  placeholderTextColor="#B3AEA6"
                  style={styles.input}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Servings</Text>
                <TextInput
                  testID="create-servings-input"
                  value={servings}
                  onChangeText={setServings}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>
            </View>

            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.wrap}>
              {DIFFICULTIES.map((d) => (
                <Pressable
                  key={d}
                  testID={`create-difficulty-${d.toLowerCase()}`}
                  onPress={() => setDifficulty(d)}
                  style={[styles.option, difficulty === d && styles.optionActive]}
                >
                  <Text style={[styles.optionText, difficulty === d && styles.optionTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.row, { marginTop: spacing.lg }]}>
              <View style={styles.half}>
                <Text style={styles.label}>Prep (min)</Text>
                <TextInput
                  testID="create-prep-input"
                  value={prep}
                  onChangeText={setPrep}
                  keyboardType="number-pad"
                  placeholder="10"
                  placeholderTextColor="#B3AEA6"
                  style={styles.input}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Cook (min)</Text>
                <TextInput
                  testID="create-cook-input"
                  value={cook}
                  onChangeText={setCook}
                  keyboardType="number-pad"
                  placeholder="25"
                  placeholderTextColor="#B3AEA6"
                  style={styles.input}
                />
              </View>
            </View>

            <Text style={styles.label}>Calories per serving</Text>
            <TextInput
              testID="create-calories-input"
              value={calories}
              onChangeText={setCalories}
              placeholder="520 kcal"
              placeholderTextColor="#B3AEA6"
              style={styles.input}
            />

            <Text style={styles.label}>Ingredients (one per line)</Text>
            <TextInput
              testID="create-ingredients-input"
              value={ingredients}
              onChangeText={setIngredients}
              placeholder={"4 chicken thighs\n1 fennel bulb"}
              placeholderTextColor="#B3AEA6"
              style={[styles.input, styles.multilineTall]}
              multiline
            />

            <Text style={styles.label}>Instructions (one step per line)</Text>
            <TextInput
              testID="create-instructions-input"
              value={steps}
              onChangeText={setSteps}
              placeholder={"Sear the thighs skin-side down\nAdd fennel and braise"}
              placeholderTextColor="#B3AEA6"
              style={[styles.input, styles.multilineTall]}
              multiline
            />
          </>
        ) : null}

        <Text style={styles.label}>Hashtags</Text>
        <TextInput
          testID="create-hashtags-input"
          value={tags}
          onChangeText={setTags}
          placeholder="#weeknight #vegetarian"
          placeholderTextColor="#B3AEA6"
          style={styles.input}
          autoCapitalize="none"
        />
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: spacing.lg }}>
        <View style={styles.cta}>
          <PrimaryButton
            testID="create-publish-button"
            label={busy ? "Publishing…" : "Publish"}
            icon="send"
            onPress={submit}
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
    paddingBottom: spacing.md,
  },
  kicker: { fontFamily: fonts.text, fontSize: 10, letterSpacing: 2, color: colors.brand, fontWeight: "700" },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface, marginTop: spacing.xs },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  kindRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  kindCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  kindCardActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  kindLabel: { fontFamily: fonts.text, fontSize: type.base, color: colors.muted, fontWeight: "600" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.lg },
  thumbWrap: { width: 76, height: 76 },
  thumb: { width: 76, height: 76, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  thumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceInverse,
    alignItems: "center",
    justifyContent: "center",
  },
  addPhoto: {
    width: 76,
    height: 76,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPhotoText: { fontFamily: fonts.text, fontSize: 10, color: colors.brand, fontWeight: "600" },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  settingsText: { fontFamily: fonts.text, fontSize: type.base, color: colors.brand, fontWeight: "600" },
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
    paddingVertical: spacing.md,
    fontFamily: fonts.text,
    fontSize: type.lg,
    color: colors.onSurface,
    marginBottom: spacing.lg,
  },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  multilineTall: { minHeight: 120, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
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
  cta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

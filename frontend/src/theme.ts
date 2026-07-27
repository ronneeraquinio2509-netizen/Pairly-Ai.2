import { Platform } from "react-native";

export const colors = {
  surface: "#FAF9F6",
  onSurface: "#1F1E1D",
  surfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#F0EFEA",
  surfaceInverse: "#1F1E1D",
  onSurfaceInverse: "#FAF9F6",
  brand: "#C85A46",
  brandSecondary: "#D47766",
  brandTertiary: "#F4EAE8",
  onBrand: "#FFFFFF",
  success: "#4D7C5D",
  warning: "#D49D42",
  error: "#B84B4B",
  muted: "#6E6A64",
  border: "#E8E6E1",
  borderStrong: "#D1CEC7",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const fonts = {
  display: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" }) as string,
  text: Platform.select({ ios: "System", android: "sans-serif", default: "System" }) as string,
};

export const type = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const images = {
  auth: "https://images.unsplash.com/photo-1690983322070-22861e13ce47?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80",
  chef: "https://images.unsplash.com/photo-1572715376701-98568319fd0b?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80",
  wine: "https://images.unsplash.com/photo-1551790629-9d5c2d781d8b?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80",
};

export const CATEGORIES = [
  { key: "ingredient", label: "Ingredient", icon: "package" as const },
  { key: "dish", label: "Dish", icon: "coffee" as const },
  { key: "beverage", label: "Beverage", icon: "droplet" as const },
];

/** Editorial fallback photography used in lists and while a hero image is generating. */
export const categoryImages: Record<string, string> = {
  ingredient:
    "https://images.unsplash.com/photo-1466637574441-749b8f19452f?crop=entropy&cs=srgb&fm=jpg&w=600&q=80",
  dish: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?crop=entropy&cs=srgb&fm=jpg&w=600&q=80",
  beverage:
    "https://images.unsplash.com/photo-1470337458703-46ad1756a187?crop=entropy&cs=srgb&fm=jpg&w=600&q=80",
};

export function categoryImage(category: string): string {
  return categoryImages[category] ?? categoryImages.ingredient;
}

import * as ImagePicker from "expo-image-picker";
import { Linking } from "react-native";

export type PickResult =
  | { status: "picked"; images: string[] }
  | { status: "cancelled" }
  | { status: "denied"; canAskAgain: boolean };

/**
 * Contextual gallery permission + picker. Returns base64 JPEGs (backend compresses further).
 * Never dead-ends: callers surface an "Open Settings" action when canAskAgain is false.
 */
export async function pickPhotos(limit = 4): Promise<PickResult> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  let granted = current.granted;
  let canAskAgain = current.canAskAgain;

  if (!granted && canAskAgain) {
    const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
    granted = asked.granted;
    canAskAgain = asked.canAskAgain;
  }
  if (!granted) return { status: "denied", canAskAgain };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 0.7,
    base64: true,
  });
  if (result.canceled) return { status: "cancelled" };

  const images = result.assets
    .map((a) => a.base64)
    .filter((b): b is string => Boolean(b))
    .slice(0, limit);
  return { status: "picked", images };
}

export function openAppSettings() {
  Linking.openSettings();
}

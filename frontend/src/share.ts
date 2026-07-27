import { Linking, Platform, Share } from "react-native";

import { Menu, Pairing } from "@/src/api";

export function pairingToText(p: Pairing): string {
  const lines: string[] = [];
  lines.push(`🍽️ Pairly — ${p.headline || p.query}`);
  if (p.summary) lines.push(`\n${p.summary}`);
  lines.push("");
  p.pairings.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.name}${item.category ? ` (${item.category})` : ""}`);
    if (item.why) lines.push(`   ${item.why}`);
    if (item.tip) lines.push(`   Tip: ${item.tip}`);
  });
  if (p.mini_recipe_title) {
    lines.push(`\n👨‍🍳 ${p.mini_recipe_title}`);
    p.mini_recipe_steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  lines.push("\nFound with Pairly");
  return lines.join("\n");
}

export function menuToText(m: Menu): string {
  const lines = [`📋 ${m.title}`, m.occasion ? `Occasion: ${m.occasion}` : "", ""];
  m.courses.forEach((c) => {
    lines.push(`${c.course}: ${c.dish}`);
    if (c.pairing) lines.push(`   Pairing: ${c.pairing}`);
    if (c.notes) lines.push(`   ${c.notes}`);
  });
  if (m.wine_notes) lines.push(`\nBeverage progression: ${m.wine_notes}`);
  lines.push("\nBuilt with Pairly");
  return lines.join("\n");
}

/** Opens WhatsApp with the text pre-filled; falls back to the OS share sheet. */
export async function shareToWhatsApp(text: string): Promise<"whatsapp" | "share"> {
  const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
  if (Platform.OS !== "web") {
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (supported) {
      await Linking.openURL(url);
      return "whatsapp";
    }
    await Share.share({ message: text });
    return "share";
  }
  await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
  return "whatsapp";
}

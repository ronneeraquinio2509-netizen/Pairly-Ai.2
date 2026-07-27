import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
export const TOKEN_KEY = "pairly_auth_token";

export type Preferences = {
  diet: string;
  cuisines: string[];
  spice: string;
  avoid: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: "home_cook" | "chef";
  preferences: Preferences;
  is_premium: boolean;
};

export type PairingItem = {
  name: string;
  category: string;
  why: string;
  tip: string;
};

export type Pairing = {
  id: string;
  query: string;
  category: string;
  context: string;
  role: string;
  headline: string;
  summary: string;
  pairings: PairingItem[];
  mini_recipe_title: string;
  mini_recipe_steps: string[];
  image_b64?: string | null;
  is_favorite: boolean;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type MenuCourse = { course: string; dish: string; pairing: string; notes: string };
export type Menu = {
  id: string;
  title: string;
  occasion: string;
  items: string[];
  courses: MenuCourse[];
  wine_notes: string;
  created_at: string;
};

export type Usage = {
  used_today: number;
  limit: number;
  remaining: number | null;
  is_premium: boolean;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const raw = data?.detail;
    const detail =
      typeof raw === "string"
        ? raw
        : Array.isArray(raw) && typeof raw[0]?.msg === "string"
          ? String(raw[0].msg).replace(/^Value error, /, "")
          : "Something went wrong";
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

export const api = {
  signup: (body: { email: string; password: string; name: string; role: string }) =>
    request<{ token: string; user: User }>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<User>("/auth/me"),
  updateProfile: (body: { name?: string; role?: string; preferences?: Preferences }) =>
    request<User>("/profile", { method: "PUT", body: JSON.stringify(body) }),
  usage: () => request<Usage>("/usage"),
  createPairing: (body: { query: string; category: string; context: string }) =>
    request<Pairing>("/pairings", { method: "POST", body: JSON.stringify(body) }),
  pairings: (favoritesOnly = false) =>
    request<Pairing[]>(`/pairings?favorites_only=${favoritesOnly}`),
  pairing: (id: string) => request<Pairing>(`/pairings/${id}`),
  pairingImage: (id: string) =>
    request<{ image_b64: string }>(`/pairings/${id}/image`, { method: "POST" }),
  chatHistory: () => request<ChatMessage[]>("/chat/messages"),
  clearChat: () => request<{ cleared: boolean }>("/chat/messages", { method: "DELETE" }),
  toggleFavorite: (id: string) =>
    request<{ id: string; is_favorite: boolean }>(`/pairings/${id}/favorite`, { method: "POST" }),
  deletePairing: (id: string) => request<{ deleted: boolean }>(`/pairings/${id}`, { method: "DELETE" }),
  createMenu: (body: { occasion: string; items: string[]; notes: string }) =>
    request<Menu>("/menus", { method: "POST", body: JSON.stringify(body) }),
  menus: () => request<Menu[]>("/menus"),
  deleteMenu: (id: string) => request<{ deleted: boolean }>(`/menus/${id}`, { method: "DELETE" }),
  paypalOrder: () =>
    request<{ order_id: string; approve_url: string | null; mocked: boolean; price: string }>(
      "/paypal/order",
      { method: "POST" },
    ),
  paypalCapture: (orderId: string) =>
    request<{ is_premium: boolean; mocked: boolean }>("/paypal/capture", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId }),
    }),
};

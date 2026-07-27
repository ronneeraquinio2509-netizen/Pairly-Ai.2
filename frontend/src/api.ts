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
  username: string;
  role: "home_cook" | "chef";
  bio: string;
  location: string;
  favorite_cuisine: string;
  website: string;
  avatar_b64?: string | null;
  cover_b64?: string | null;
  preferences: Preferences;
  is_premium: boolean;
  is_creator: boolean;
};

export type PairingItem = {
  name: string;
  category: string;
  why: string;
  tip: string;
  flavor_profile?: string;
  nutrition_notes?: string;
  alternatives?: string[];
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

export type Author = {
  id: string;
  name: string;
  username: string;
  avatar_b64?: string | null;
  role: string;
};

export type Nutrition = { calories: string; protein: string; carbs: string; fat: string };

export type Recipe = {
  title: string;
  description: string;
  cuisine: string;
  difficulty: string;
  prep_time_min: number;
  cook_time_min: number;
  servings: number;
  ingredients: string[];
  instructions: string[];
  nutrition: Nutrition;
  tags: string[];
  diet: string;
  shopping_list: string[];
  drink_pairing: string;
  dessert_pairing: string;
  ingredient_alternatives: string[];
};

export type Post = {
  id: string;
  kind: "photo" | "recipe" | "pairing";
  caption: string;
  hashtags: string[];
  images: string[];
  recipe?: Recipe | null;
  like_count: number;
  comment_count: number;
  bookmark_count: number;
  created_at: string;
  author: Author;
  is_liked: boolean;
  is_bookmarked: boolean;
  is_following_author: boolean;
};

export type Comment = {
  id: string;
  post_id: string;
  parent_id?: string | null;
  content: string;
  created_at: string;
  author: Author;
};

export type Collection = { id: string; name: string; post_ids: string[]; count: number };

export type Notification = {
  id: string;
  actor_name: string;
  kind: string;
  post_id?: string | null;
  message: string;
  read: boolean;
  created_at: string;
};

export type PublicProfile = Author & {
  bio: string;
  location: string;
  favorite_cuisine: string;
  website: string;
  cover_b64?: string | null;
  is_premium: boolean;
  followers_count: number;
  following_count: number;
  recipe_count: number;
  post_count: number;
  is_following: boolean;
  is_self: boolean;
  posts: Post[];
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
  updateProfile: (body: {
    name?: string;
    username?: string;
    role?: string;
    bio?: string;
    location?: string;
    favorite_cuisine?: string;
    website?: string;
    avatar_b64?: string | null;
    cover_b64?: string | null;
    preferences?: Preferences;
  }) => request<User>("/profile", { method: "PUT", body: JSON.stringify(body) }),
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

  // --- social
  feed: (scope: "for_you" | "following" = "for_you") => request<Post[]>(`/feed?scope=${scope}`),
  createPost: (body: {
    kind: string;
    caption: string;
    hashtags: string[];
    images: string[];
    recipe?: Partial<Recipe> | null;
  }) => request<Post>("/posts", { method: "POST", body: JSON.stringify(body) }),
  post: (id: string) => request<Post>(`/posts/${id}`),
  deletePost: (id: string) => request<{ deleted: boolean }>(`/posts/${id}`, { method: "DELETE" }),
  toggleLike: (id: string) =>
    request<{ is_liked: boolean; like_count: number }>(`/posts/${id}/like`, { method: "POST" }),
  comments: (id: string) => request<Comment[]>(`/posts/${id}/comments`),
  addComment: (id: string, content: string, parentId?: string) =>
    request<Comment>(`/posts/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ content, parent_id: parentId ?? null }),
    }),
  deleteComment: (id: string) => request<{ deleted: boolean }>(`/comments/${id}`, { method: "DELETE" }),
  toggleBookmark: (id: string, collectionName = "Favorites") =>
    request<{ is_bookmarked: boolean; collection: string }>(`/posts/${id}/bookmark`, {
      method: "POST",
      body: JSON.stringify({ collection_name: collectionName }),
    }),
  collections: () => request<Collection[]>("/collections"),
  createCollection: (name: string) =>
    request<Collection>("/collections", { method: "POST", body: JSON.stringify({ name }) }),
  collectionPosts: (id: string) => request<Post[]>(`/collections/${id}/posts`),
  toggleFollow: (userId: string) =>
    request<{ is_following: boolean }>(`/users/${userId}/follow`, { method: "POST" }),
  publicProfile: (userId: string) => request<PublicProfile>(`/users/${userId}`),
  followers: (userId: string) => request<Author[]>(`/users/${userId}/followers`),
  following: (userId: string) => request<Author[]>(`/users/${userId}/following`),
  likedPosts: () => request<Post[]>("/me/liked"),
  search: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== "" && v !== 0)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<{ users: Author[]; posts: Post[]; pairings: Pairing[] }>(`/search?${qs}`);
  },
  notifications: () => request<Notification[]>("/notifications"),
  markNotificationsRead: () => request<{ read: boolean }>("/notifications/read", { method: "POST" }),
  generateRecipe: (body: {
    ingredients: string[];
    cuisine: string;
    diet: string;
    budget: string;
    cooking_time: string;
    difficulty: string;
    calories: string;
    goal: string;
  }) => request<{ id: string; recipe: Recipe }>("/recipes/generate", { method: "POST", body: JSON.stringify(body) }),
  generatedRecipes: () =>
    request<{ id: string; recipe: Recipe; created_at: string }[]>("/recipes/generated"),
};

const USERNAME_KEY = "hd-username";
const AVATAR_KEY = "hd-avatar";
const BROADCASTER_KEY_STORAGE = "hd-broadcaster-key";

export const AVATAR_CHOICES = [
  "🐱", "🐶", "🦊", "🐼", "🐰", "🦁",
  "🐸", "🐨", "🐵", "🐷", "🐧", "🐙",
  "🦄", "🐻", "🐯", "🐮",
];

export function randomAvatar(): string {
  return AVATAR_CHOICES[Math.floor(Math.random() * AVATAR_CHOICES.length)];
}

const AVATAR_BG_COLORS = [
  "bg-red-500/20", "bg-orange-500/20", "bg-amber-500/20", "bg-lime-500/20",
  "bg-emerald-500/20", "bg-teal-500/20", "bg-sky-500/20", "bg-indigo-500/20",
  "bg-violet-500/20", "bg-fuchsia-500/20", "bg-pink-500/20", "bg-rose-500/20",
];

export function avatarColor(avatar: string): string {
  const index = AVATAR_CHOICES.indexOf(avatar);
  return AVATAR_BG_COLORS[index === -1 ? 0 : index % AVATAR_BG_COLORS.length];
}

export type Profile = { username: string; avatar: string };

export function getProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const username = window.localStorage.getItem(USERNAME_KEY);
  const avatar = window.localStorage.getItem(AVATAR_KEY);
  if (!username || !avatar) return null;
  return { username, avatar };
}

export function saveProfile(profile: Profile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERNAME_KEY, profile.username);
  window.localStorage.setItem(AVATAR_KEY, profile.avatar);
}

export function getBroadcasterKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(BROADCASTER_KEY_STORAGE);
}

export function saveBroadcasterKey(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BROADCASTER_KEY_STORAGE, key);
}

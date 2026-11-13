import { useSyncExternalStore } from "react";
import type { AuthUser } from "../types/auth";

const AUTH_USER_KEY = "scholarone_user";
const ACCESS_TOKEN_KEY = "scholarone_access_token";

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function storeAccessToken(token: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function getStoredUser(): AuthUser | null {
  const rawUser = localStorage.getItem(AUTH_USER_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    localStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
}

export function storeUser(user: AuthUser) {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("scholarone-user-updated"));
}

export function clearStoredUser() {
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

function subscribeUser(callback: () => void) {
  window.addEventListener("scholarone-user-updated", callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener("scholarone-user-updated", callback); window.removeEventListener("storage", callback); };
}
export function useStoredUser() {
  const raw = useSyncExternalStore(subscribeUser, () => localStorage.getItem(AUTH_USER_KEY));
  try { return raw ? JSON.parse(raw) as AuthUser : null; } catch { return null; }
}

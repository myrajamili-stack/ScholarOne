import type { AuthUser } from "../types/auth";

const AUTH_USER_KEY = "scholarone_user";

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
}

export function clearStoredUser() {
  localStorage.removeItem(AUTH_USER_KEY);
}

// ============================================
// Auth state management
// ============================================

import { useCallback, useEffect, useState } from "react";
import { getToken, setToken, clearToken } from "../api/client";
import { spFetch } from "../api/client";
import { SessionUser } from "../api/types";

let _listeners: Array<() => void> = [];
let _user: SessionUser | null = null;
let _loading = true;

function notify() {
  _listeners.forEach((fn) => fn());
}

export async function initAuth(): Promise<SessionUser | null> {
  _loading = true;
  notify();
  try {
    const token = await getToken();
    if (!token) {
      _user = null;
      _loading = false;
      notify();
      return null;
    }
    const session = await spFetch<{ user: SessionUser }>("/api/auth/session");
    _user = session.user;
    _loading = false;
    notify();
    return _user;
  } catch {
    _user = null;
    _loading = false;
    notify();
    return null;
  }
}

export async function loginWithToken(
  token: string,
): Promise<SessionUser | null> {
  await setToken(token);
  return initAuth();
}

export async function logout(): Promise<void> {
  await clearToken();
  _user = null;
  _loading = false;
  notify();
}

export function useAuthStore() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    _listeners.push(listener);
    return () => {
      _listeners = _listeners.filter((l) => l !== listener);
    };
  }, []);

  return {
    user: _user,
    loading: _loading,
    isAuthenticated: !!_user,
  };
}

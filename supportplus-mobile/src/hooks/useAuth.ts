// ============================================
// Auth hook
// ============================================

import { useEffect } from "react";
import { useAuthStore, initAuth, loginWithToken, logout } from "../store/auth";

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    initAuth();
  }, []);

  return {
    ...store,
    login: loginWithToken,
    logout,
    refresh: initAuth,
  };
}

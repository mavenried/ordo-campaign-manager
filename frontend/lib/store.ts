import { create } from "zustand";
import type { User } from "@/types";
import { clearToken, getToken, getUser, setToken } from "./auth";

interface AuthState {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  login: (token, user) => {
    setToken(token);
    set({ token, user });
  },
  logout: () => {
    clearToken();
    set({ token: null, user: null });
  },
  init: () => {
    const token = getToken();
    const user = getUser();
    if (token && user) set({ token, user });
  },
}));

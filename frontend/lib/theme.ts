import { create } from "zustand";

export type ThemeMode = "light" | "dark";
export type ThemeName = "slate" | "noir" | "forest" | "ember" | "ocean" | "petal";

export const THEMES: { name: ThemeName; label: string; light: string; dark: string }[] = [
  { name: "slate",  label: "Slate",  light: "#6366f1", dark: "#818cf8" },
  { name: "noir",   label: "Noir",   light: "#18181b", dark: "#e4e4e7" },
  { name: "forest", label: "Forest", light: "#16a34a", dark: "#4ade80" },
  { name: "ember",  label: "Ember",  light: "#d97706", dark: "#f59e0b" },
  { name: "ocean",  label: "Ocean",  light: "#0284c7", dark: "#38bdf8" },
  { name: "petal",  label: "Petal",  light: "#c4507a", dark: "#e07da0" },
];

interface ThemeState {
  mode: ThemeMode;
  name: ThemeName;
  toggleMode: () => void;
  setTheme: (name: ThemeName) => void;
  init: () => void;
}

function apply(name: ThemeName, mode: ThemeMode) {
  const el = document.documentElement;
  el.setAttribute("data-theme", name);
  if (mode === "dark") el.classList.add("dark");
  else el.classList.remove("dark");
  localStorage.setItem("ordo-theme", JSON.stringify({ name, mode }));
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "light",
  name: "slate",
  toggleMode: () => {
    const next: ThemeMode = get().mode === "dark" ? "light" : "dark";
    apply(get().name, next);
    set({ mode: next });
  },
  setTheme: (name) => {
    apply(name, get().mode);
    set({ name });
  },
  init: () => {
    try {
      const saved = JSON.parse(localStorage.getItem("ordo-theme") ?? "{}");
      const name: ThemeName = saved.name ?? "slate";
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const mode: ThemeMode = saved.mode ?? (prefersDark ? "dark" : "light");
      apply(name, mode);
      set({ name, mode });
    } catch {
      apply("slate", "light");
    }
  },
}));

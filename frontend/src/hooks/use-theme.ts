import { create } from "zustand";

export type Theme = "light" | "dark";
export const THEME_KEY = "blueprint-theme";

interface ThemeState {
  theme: Theme;
  /** Reads what the inline head script already applied to <html>. Call once on the client. */
  init: () => void;
  toggle: () => void;
}

const apply = (theme: Theme) => {
  document.documentElement.classList.toggle("dark", theme === "dark");
};

export const useTheme = create<ThemeState>()((set, get) => ({
  theme: "light",
  init: () => {
    set({ theme: document.documentElement.classList.contains("dark") ? "dark" : "light" });
  },
  toggle: () => {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    apply(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
    set({ theme });
  },
}));

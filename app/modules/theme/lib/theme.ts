export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "cadence-theme";

export type ThemeRoot = {
  classList: { toggle(token: string, force: boolean): unknown };
};

export type ThemeStorage = { setItem(key: string, value: string): void };

export function oppositeTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function writeTheme(
  theme: Theme,
  target: { root: ThemeRoot; storage: () => ThemeStorage }
): void {
  target.root.classList.toggle("dark", theme === "dark");
  try {
    target.storage().setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Blocked storage throws on access, a full quota throws on write. The page
    // still changes theme; only the preference is forgotten next visit.
  }
}

// Runs inline in <head> before the first paint, so it cannot import anything:
// a dark-mode reader would otherwise see a white flash on every load.
export const themeBootScript = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})==="dark"){document.documentElement.classList.add("dark");}}catch(_){}})();`;

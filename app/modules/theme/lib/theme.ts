export const THEME_STORAGE_KEY = "cadence-theme";
const DARK_CLASS = "dark";

export type Theme = "light" | "dark";

type ThemeRoot = {
  classList: {
    contains(token: string): boolean;
    toggle(token: string, force: boolean): unknown;
  };
};

type ThemeStorage = { setItem(key: string, value: string): void };

export function currentTheme(root: ThemeRoot): Theme {
  return root.classList.contains(DARK_CLASS) ? "dark" : "light";
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function applyTheme(
  theme: Theme,
  root: ThemeRoot,
  storage: ThemeStorage
): void {
  root.classList.toggle(DARK_CLASS, theme === "dark");
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing can refuse storage; the page still switches.
  }
}

// Runs inline in <head> before first paint, so it cannot import anything.
export const themeBootScript = `(function () {
  try {
    if (localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) === "dark") {
      document.documentElement.classList.add(${JSON.stringify(DARK_CLASS)});
    }
  } catch (e) {}
})();`;

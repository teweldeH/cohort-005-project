/**
 * Light and dark mode: how the choice is stored, applied to the page and
 * restored before first paint. Every theme toggle goes through here, so the
 * landing page and the app shell can never disagree about it.
 */
import {
  oppositeTheme,
  writeTheme,
  themeBootScript,
  type Theme,
  type ThemeRoot,
  type ThemeStorage,
} from "./lib/theme";

export type { Theme, ThemeRoot, ThemeStorage };

/** The theme the page is showing, read from the root element's classes. */
export function themeOfRoot(root: {
  classList: { contains(token: string): boolean };
}): Theme {
  return root.classList.contains("dark") ? "dark" : "light";
}

/**
 * Switch from `current` to the other theme: restyle the page, remember the
 * choice, and return the new theme. `storage` is a getter because merely
 * reading `localStorage` can throw; the page changes either way.
 */
export function toggleTheme(
  current: Theme,
  target: { root: ThemeRoot; storage: () => ThemeStorage }
): Theme {
  const next = oppositeTheme(current);
  writeTheme(next, target);
  return next;
}

/** An inline script for `<head>` that applies the stored theme pre-paint. */
export const themeScript: string = themeBootScript;

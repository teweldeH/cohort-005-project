import { useEffect, useState } from "react";
import { themeOfRoot, toggleTheme, type Theme } from "~/modules/theme";

/** The page's current theme, and a toggle that switches and remembers it. */
export function useTheme(): { isDark: boolean; toggle: () => void } {
  // Light on the server; the boot script in root.tsx may already have
  // applied dark, which the effect reads back after hydration.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(themeOfRoot(document.documentElement));
  }, []);

  function toggle() {
    setTheme(
      toggleTheme(theme, {
        root: document.documentElement,
        storage: () => window.localStorage,
      })
    );
  }

  return { isDark: theme === "dark", toggle };
}

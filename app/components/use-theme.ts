import { useEffect, useState } from "react";
import {
  applyTheme,
  currentTheme,
  oppositeTheme,
  type Theme,
} from "~/modules/theme";

export function useTheme() {
  // Server render has no document; the effect syncs with the boot script.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(currentTheme(document.documentElement));
  }, []);

  function toggle() {
    const next = oppositeTheme(theme);
    setTheme(next);
    applyTheme(next, document.documentElement, localStorage);
  }

  return { isDark: theme === "dark", toggle };
}

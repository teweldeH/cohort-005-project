import { describe, it, expect } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  currentTheme,
  oppositeTheme,
  themeBootScript,
} from "../index";

function fakeRoot(initial: string[] = []) {
  const classes = new Set(initial);
  return {
    classes,
    classList: {
      contains: (token: string) => classes.has(token),
      add: (token: string) => classes.add(token),
      toggle: (token: string, force: boolean) => {
        if (force) classes.add(token);
        else classes.delete(token);
        return force;
      },
    },
  };
}

function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("currentTheme", () => {
  it("is dark when the root has the dark class", () => {
    expect(currentTheme(fakeRoot(["dark"]))).toBe("dark");
  });

  it("is light otherwise", () => {
    expect(currentTheme(fakeRoot())).toBe("light");
    expect(currentTheme(fakeRoot(["darker"]))).toBe("light");
  });
});

describe("oppositeTheme", () => {
  it("flips each theme", () => {
    expect(oppositeTheme("dark")).toBe("light");
    expect(oppositeTheme("light")).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("adds the dark class and remembers dark", () => {
    const root = fakeRoot();
    const storage = fakeStorage();
    applyTheme("dark", root, storage);
    expect([...root.classes]).toEqual(["dark"]);
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("removes the dark class and remembers light", () => {
    const root = fakeRoot(["dark", "other"]);
    const storage = fakeStorage({ [THEME_STORAGE_KEY]: "dark" });
    applyTheme("light", root, storage);
    expect([...root.classes]).toEqual(["other"]);
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe("light");
  });

  it("still switches when storage refuses the write", () => {
    const root = fakeRoot();
    const storage = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => applyTheme("dark", root, storage)).not.toThrow();
    expect(root.classes.has("dark")).toBe(true);
  });
});

type BootStorage = { getItem(key: string): string | null };

function boot(storage: BootStorage) {
  const root = fakeRoot();
  new Function("localStorage", "document", themeBootScript)(storage, {
    documentElement: root,
  });
  return root;
}

describe("themeBootScript", () => {
  it("applies a stored dark theme before React loads", () => {
    expect(
      boot(fakeStorage({ [THEME_STORAGE_KEY]: "dark" })).classes.has("dark")
    ).toBe(true);
  });

  it("leaves the page light for a stored light theme or none", () => {
    expect(
      boot(fakeStorage({ [THEME_STORAGE_KEY]: "light" })).classes.size
    ).toBe(0);
    expect(boot(fakeStorage()).classes.size).toBe(0);
  });

  it("reads the same key that applyTheme writes", () => {
    const storage = fakeStorage();
    applyTheme("dark", fakeRoot(), storage);
    expect(boot(storage).classes.has("dark")).toBe(true);
  });

  it("does not throw when storage is unavailable", () => {
    const refusing = {
      getItem: (): string | null => {
        throw new Error("SecurityError");
      },
    };
    expect(() => boot(refusing)).not.toThrow();
  });
});

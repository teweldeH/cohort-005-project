import { describe, it, expect } from "vitest";
import { runInNewContext } from "node:vm";
import { themeOfRoot, toggleTheme, themeScript } from "../index";

function fakeRoot(initial: string[] = []) {
  const classes = new Set(initial);
  return {
    classes,
    classList: {
      contains: (token: string) => classes.has(token),
      add: (token: string) => classes.add(token),
      toggle(token: string, force: boolean) {
        if (force) classes.add(token);
        else classes.delete(token);
        return force;
      },
    },
  };
}

function fakeStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("themeOfRoot", () => {
  it("is dark when the root carries the dark class", () => {
    expect(themeOfRoot(fakeRoot(["dark"]))).toBe("dark");
  });

  it("is light otherwise", () => {
    expect(themeOfRoot(fakeRoot(["other"]))).toBe("light");
  });
});

describe("toggleTheme", () => {
  it("goes from light to dark, restyles the page and remembers it", () => {
    const root = fakeRoot();
    const storage = fakeStorage();

    expect(toggleTheme("light", { root, storage: () => storage })).toBe("dark");
    expect(root.classes.has("dark")).toBe(true);
    expect(storage.items.get("cadence-theme")).toBe("dark");
  });

  it("goes from dark to light and remembers light", () => {
    const root = fakeRoot(["dark"]);
    const storage = fakeStorage();

    expect(toggleTheme("dark", { root, storage: () => storage })).toBe("light");
    expect(root.classes.has("dark")).toBe(false);
    expect(storage.items.get("cadence-theme")).toBe("light");
  });

  it("still restyles the page when storage throws", () => {
    const root = fakeRoot();
    const storage = {
      setItem() {
        throw new Error("QuotaExceededError");
      },
    };

    expect(toggleTheme("light", { root, storage: () => storage })).toBe("dark");
    expect(root.classes.has("dark")).toBe(true);
  });

  it("still restyles the page when storage cannot even be reached", () => {
    const root = fakeRoot();
    const storage = (): Storage => {
      throw new Error("SecurityError");
    };

    expect(toggleTheme("light", { root, storage })).toBe("dark");
    expect(root.classes.has("dark")).toBe(true);
  });
});

describe("themeScript", () => {
  function boot(storage: { getItem(key: string): string | null }) {
    const root = fakeRoot();
    runInNewContext(themeScript, {
      localStorage: storage,
      document: { documentElement: root },
    });
    return root.classes;
  }

  it("applies a theme that toggleTheme stored", () => {
    const storage = fakeStorage();
    toggleTheme("light", { root: fakeRoot(), storage: () => storage });

    expect(boot(storage).has("dark")).toBe(true);
  });

  it("leaves the page light with no stored preference", () => {
    expect(boot(fakeStorage()).has("dark")).toBe(false);
  });

  it("leaves the page light after a light preference", () => {
    expect(boot(fakeStorage({ "cadence-theme": "light" })).has("dark")).toBe(
      false
    );
  });

  it("does not throw when storage is unreadable", () => {
    const storage = {
      getItem(): string | null {
        throw new Error("SecurityError");
      },
    };

    expect(boot(storage).has("dark")).toBe(false);
  });
});

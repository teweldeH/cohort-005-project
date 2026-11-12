// PROTOTYPE — throwaway. Floating bar for flipping between `?variant=` keys.
// Lives on the prototype/* branch only; never merge to main.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STORAGE_KEY = "prototype-variant";

// The variant sticks across in-app navigation (links drop the query string),
// so fall back to sessionStorage when the param is absent.
export function usePrototypeVariant(keys: string[]): string {
  const [searchParams] = useSearchParams();
  const fromUrl = searchParams.get("variant");
  let stored: string | null = null;
  try {
    stored = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
  } catch {}
  const variant = fromUrl ?? stored ?? keys[0];
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, variant);
    } catch {}
  }, [variant]);
  return keys.includes(variant) ? variant : keys[0];
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: { key: string; name: string }[];
  current: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );

  function go(delta: number) {
    const next = variants[(index + delta + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams);
    params.set("variant", next.key);
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-fuchsia-600 px-2 py-1 text-sm font-medium text-white shadow-xl ring-2 ring-white">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/20">
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-1">
        PROTOTYPE {variants[index].key} ({variants[index].name})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/20">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

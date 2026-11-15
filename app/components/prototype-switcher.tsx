// PROTOTYPE — floating variant switcher for throwaway UI prototypes. Never ships.
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
}: {
  variants: { key: string; name: string }[];
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const current = params.get("variant") ?? variants[0].key;
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );

  function go(delta: number) {
    const next = variants[(index + delta + variants.length) % variants.length];
    const p = new URLSearchParams(params);
    p.set("variant", next.key);
    navigate({ search: p.toString() }, { replace: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (
        t.closest("input, textarea, select, [contenteditable]") ||
        (e.key !== "ArrowLeft" && e.key !== "ArrowRight")
      )
        return;
      go(e.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-lg ring-2 ring-yellow-400">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/20">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-48 text-center font-medium">
        {variants[index].key} ({variants[index].name})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/20">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/** What the mock actions would have done, newest first. */
export function PrototypeLog({ lines }: { lines: string[] }) {
  if (import.meta.env.PROD || lines.length === 0) return null;
  return (
    <div className="fixed bottom-16 left-4 z-50 max-w-sm rounded-md bg-black/85 p-3 font-mono text-xs text-yellow-200 shadow-lg">
      <p className="mb-1 font-semibold text-yellow-400">PROTOTYPE — nothing saved</p>
      {lines.map((l, i) => (
        <p key={i} className={i === 0 ? "" : "opacity-60"}>
          {l}
        </p>
      ))}
    </div>
  );
}

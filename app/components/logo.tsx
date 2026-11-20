import { Link } from "react-router";
import { GraduationCap } from "lucide-react";
import { cn } from "~/lib/utils";

const sizes = {
  sm: { text: "text-lg", mark: "size-7", icon: "size-4" },
  md: { text: "text-xl", mark: "size-8", icon: "size-5" },
  lg: { text: "text-2xl", mark: "size-10", icon: "size-6" },
};

/** The Cadence mark and wordmark, linking home. One brand on every page. */
export function Logo({
  size = "md",
  className,
}: {
  size?: keyof typeof sizes;
  className?: string;
}) {
  const s = sizes[size];
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex items-center gap-2 font-bold tracking-tight",
        s.text,
        className
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-500/25",
          s.mark
        )}
      >
        <GraduationCap className={s.icon} />
      </span>
      Cadence
    </Link>
  );
}

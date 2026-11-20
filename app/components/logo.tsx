import { Link } from "react-router";
import { GraduationCap } from "lucide-react";
import { cn } from "~/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "flex items-center gap-2 text-xl font-bold tracking-tight",
        className
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
        <GraduationCap className="size-5" />
      </span>
      Cadence
    </Link>
  );
}

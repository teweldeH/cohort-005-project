/**
 * The nav target to highlight for `pathname`: the longest one it sits under.
 * Prefix matching alone lit up both "/instructor" and "/instructor/analytics"
 * on the analytics page, because one target nests inside the other.
 */
export function activeNavTarget(
  targets: readonly string[],
  pathname: string
): string | null {
  let best: string | null = null;
  for (const target of targets) {
    const under = pathname === target || pathname.startsWith(`${target}/`);
    if (under && (best === null || target.length > best.length)) best = target;
  }
  return best;
}

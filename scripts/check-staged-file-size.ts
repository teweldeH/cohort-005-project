// Refuses a commit that stages a file too big for an agent to read whole.
// An agent reads a large file in pieces and edits it from a partial view,
// so every file stays under MAX_TOKENS. Tokens are estimated cheaply as
// bytes / 4, which is close enough for English and code.
//
//   npx tsx scripts/check-staged-file-size.ts   # run by .githooks/pre-commit
//
// Measures the staged blob, not the working copy, so it checks what will
// actually be committed.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MAX_TOKENS = 10_000;
const BYTES_PER_TOKEN = 4;

/** Generated or lock files nobody reads by hand. */
const EXEMPT = [
  /(^|\/)package-lock\.json$/,
  /^skills-lock\.json$/,
  /^eslint-suppressions\.json$/,
  /^drizzle\/meta\//,
  /\.db$/,
];

export type StagedFile = { path: string; bytes: number; binary: boolean };

export function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / BYTES_PER_TOKEN);
}

export function findOversizedFiles(files: StagedFile[]): StagedFile[] {
  return files.filter(
    (file) =>
      !file.binary &&
      !EXEMPT.some((pattern) => pattern.test(file.path)) &&
      estimateTokens(file.bytes) > MAX_TOKENS
  );
}

/** How to split a file of this kind, along the seams this repo already uses. */
export function splitGuidance(path: string): string {
  if (/\.test\.tsx?$/.test(path)) {
    return [
      "Split the tests by behaviour: one file per top-level `describe`, named",
      "`<subject>.<behaviour>.test.ts` next to the original. Move shared",
      "fixtures and builders into a `test-helpers.ts` beside them, and import",
      "it from each test file.",
    ].join("\n");
  }
  if (path.startsWith("app/routes/")) {
    return [
      "A route file should only wire the loader, action and page together.",
      "- Move data work (queries, permission checks, mutations) into a deep",
      "  module under `app/modules/<name>/`. Read app/modules/README.md first.",
      "- Move each sub-component into its own file under",
      "  `app/components/<route-name>/`, one component per file.",
      "- Leave `loader`, `action` and the default export in the route.",
    ].join("\n");
  }
  if (path.startsWith("app/modules/")) {
    return [
      "Split the implementation by responsibility into several files under the",
      "module's `lib/`. Keep the module's entry point (its root files) the",
      "same, so no caller has to change its imports.",
    ].join("\n");
  }
  if (/\.tsx$/.test(path)) {
    return [
      "Extract each child component, and any hook with its own state, into its",
      "own file in a folder named after this component. Keep this file as the",
      "component that composes them.",
    ].join("\n");
  }
  if (/\.mdx?$/.test(path)) {
    return [
      "Split the document at its top-level headings into files in a folder",
      "named after it, and leave this file as a short index linking to each.",
    ].join("\n");
  }
  return [
    "Split the file by responsibility: group the exports that change together",
    "into their own file, and import them from here or from the callers.",
  ].join("\n");
}

export function formatReport(oversized: StagedFile[]): string {
  const files = oversized.map((file) => {
    const tokens = estimateTokens(file.bytes);
    const parts = Math.ceil(tokens / (MAX_TOKENS / 2));
    return [
      `✖ ${file.path}: ~${tokens.toLocaleString("en")} tokens (${file.bytes.toLocaleString("en")} bytes / ${BYTES_PER_TOKEN})`,
      `  Aim for about ${parts} files of under ${(MAX_TOKENS / 2).toLocaleString("en")} tokens each.`,
      ...splitGuidance(file.path)
        .split("\n")
        .map((line) => `  ${line}`),
    ].join("\n");
  });
  return [
    `Commit refused: staged files over the ${MAX_TOKENS.toLocaleString("en")}-token limit.`,
    "",
    ...files.flatMap((file) => [file, ""]),
    "How to split safely:",
    "  1. Split along seams that already exist (exports, components,",
    "     `describe` blocks, headings), never at an arbitrary line.",
    "  2. Move code verbatim first; change behaviour in a separate commit.",
    "  3. Leave each new file well under the limit so it has room to grow.",
    "  4. Run `npm run check`, stage the new files, and commit again.",
  ].join("\n");
}

function git(args: string[], input?: string): string {
  return execFileSync("git", args, { encoding: "utf8", input });
}

function readStagedFiles(): StagedFile[] {
  // --numstat prints "-\t-\t<path>" for a binary file.
  const numstat = git([
    "diff",
    "--cached",
    "--numstat",
    "--no-renames",
    "--diff-filter=ACM",
    "-z",
  ]);
  const entries = numstat
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [added, , path] = line.split("\t");
      return { path, binary: added === "-" };
    });
  if (entries.length === 0) return [];

  const sizes = git(
    ["cat-file", "--batch-check=%(objectsize)"],
    entries.map((entry) => `:${entry.path}`).join("\n") + "\n"
  )
    .trim()
    .split("\n");
  return entries.map((entry, index) => ({
    ...entry,
    bytes: Number(sizes[index]),
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const oversized = findOversizedFiles(readStagedFiles());
  if (oversized.length > 0) {
    console.error(formatReport(oversized));
    process.exit(1);
  }
}

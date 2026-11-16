// ─── Example module ───
// A copy-me template: root files are entry points, subfolders are private.
// Copy this folder to start a module, or delete it.
import { countWords } from "./lib/impl";

/** A one-line summary of some text, e.g. "3 words". */
export function summarise(text: string): string {
  const count = countWords(text);
  return `${count} ${count === 1 ? "word" : "words"}`;
}

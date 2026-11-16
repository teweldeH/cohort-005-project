// Implementation detail: reachable only from inside this package.
export function countWords(text: string): number {
  const words = text.trim().split(/\s+/);
  return words[0] === "" ? 0 : words.length;
}

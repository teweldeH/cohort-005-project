export function lessonNoun(count: number): "lesson" | "lessons" {
  return count === 1 ? "lesson" : "lessons";
}

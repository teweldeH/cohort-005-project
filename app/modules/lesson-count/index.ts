import { lessonNoun } from "./lib/plural";

export function formatLessonCount(count: number): string {
  return `${count} ${lessonNoun(count)}`;
}

/** "0 / 1 lesson", "3 / 12 lessons": the noun agrees with the total. */
export function formatLessonProgress(completed: number, total: number): string {
  return `${completed} / ${formatLessonCount(total)}`;
}

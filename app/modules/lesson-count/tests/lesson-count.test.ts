import { describe, it, expect } from "vitest";
import { formatLessonCount, formatLessonProgress } from "../index";

describe("formatLessonCount", () => {
  it("says lesson for exactly one", () => {
    expect(formatLessonCount(1)).toBe("1 lesson");
  });

  it("says lessons for none", () => {
    expect(formatLessonCount(0)).toBe("0 lessons");
  });

  it("says lessons for more than one", () => {
    expect(formatLessonCount(2)).toBe("2 lessons");
    expect(formatLessonCount(19)).toBe("19 lessons");
  });
});

describe("formatLessonProgress", () => {
  it("agrees the noun with a total of one", () => {
    expect(formatLessonProgress(1, 1)).toBe("1 / 1 lesson");
    expect(formatLessonProgress(0, 1)).toBe("0 / 1 lesson");
  });

  it("agrees the noun with the total, not the completed count", () => {
    expect(formatLessonProgress(1, 5)).toBe("1 / 5 lessons");
  });
});

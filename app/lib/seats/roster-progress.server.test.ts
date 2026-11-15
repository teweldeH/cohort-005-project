import { describe, it, expect, beforeEach, vi } from "vitest";
import * as schema from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import { claimSeat, getTeamRoster } from "./index.server";
import { seatFixtures } from "./test-fixtures";
import { learningFixtures } from "./learning-fixtures";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

let base: ReturnType<typeof seedBaseData>;
let fixtures: ReturnType<typeof seatFixtures>;
let learning: ReturnType<typeof learningFixtures>;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  fixtures = seatFixtures(testDb, base);
  learning = learningFixtures(testDb, base);
});

function holderProgress() {
  const result = getTeamRoster(base.user.id);
  if (!result.ok) throw new Error(`No roster: ${result.reason}`);
  const [seat] = result.roster.purchases[0].seats;
  if (seat.status !== "claimed") throw new Error(`Seat is ${seat.status}`);
  return seat.progress;
}

describe("getTeamRoster: a holder's Progress", () => {
  it("shows a holder who hasn't started as 0% and never active", () => {
    const holder = fixtures.addStudent("holder@example.com");
    learning.addLessons(4);
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");

    expect(holderProgress()).toEqual({
      percent: 0,
      finished: false,
      lastActive: null,
    });
  });

  it("shows the % of lessons completed and when the holder last completed one", () => {
    const holder = fixtures.addStudent("holder@example.com");
    const [first, second] = learning.addLessons(4);
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");
    learning.completeLesson(holder.id, first.id, "2026-03-01T10:00:00.000Z");
    learning.completeLesson(holder.id, second.id, "2026-03-02T10:00:00.000Z");

    expect(holderProgress()).toEqual({
      percent: 50,
      finished: false,
      lastActive: "2026-03-02T10:00:00.000Z",
    });
  });

  it("shows a holder who completed every lesson as Finished", () => {
    const holder = fixtures.addStudent("holder@example.com");
    const lessons = learning.addLessons(3);
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");
    for (const lesson of lessons) {
      learning.completeLesson(holder.id, lesson.id, "2026-03-01T10:00:00.000Z");
    }

    expect(holderProgress()).toMatchObject({ percent: 100, finished: true });
  });

  it("counts a video watch or a quiz attempt as being active", () => {
    const holder = fixtures.addStudent("holder@example.com");
    const [first, second] = learning.addLessons(2);
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");
    learning.completeLesson(holder.id, first.id, "2026-03-01T10:00:00.000Z");
    learning.watchVideo(holder.id, second.id, "2026-03-03T10:00:00.000Z");
    learning.attemptQuiz(holder.id, first.id, "2026-03-02T10:00:00.000Z");

    expect(holderProgress().lastActive).toBe("2026-03-03T10:00:00.000Z");

    learning.attemptQuiz(holder.id, second.id, "2026-03-04T10:00:00.000Z");

    expect(holderProgress().lastActive).toBe("2026-03-04T10:00:00.000Z");
  });

  it("ignores activity on other courses", () => {
    const holder = fixtures.addStudent("holder@example.com");
    learning.addLessons(2);
    const otherCourse = testDb
      .insert(schema.courses)
      .values({
        title: "Other Course",
        slug: "other-course",
        description: "Another course",
        salesCopy: "Another course",
        status: schema.CourseStatus.Published,
        instructorId: base.instructor.id,
        categoryId: base.category.id,
      })
      .returning()
      .get();
    const [elsewhere] = learning.addLessons(1, otherCourse.id);
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");
    learning.completeLesson(holder.id, elsewhere.id, "2026-03-01T10:00:00.000Z");
    learning.watchVideo(holder.id, elsewhere.id, "2026-03-01T10:00:00.000Z");
    learning.attemptQuiz(holder.id, elsewhere.id, "2026-03-01T10:00:00.000Z");

    expect(holderProgress()).toEqual({
      percent: 0,
      finished: false,
      lastActive: null,
    });
  });
});

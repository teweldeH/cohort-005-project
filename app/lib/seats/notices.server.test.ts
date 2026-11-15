import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  claimSeat,
  getClaimView,
  getStudentCourseNotices,
  releaseSeat,
} from "./index.server";
import { seatFixtures } from "./test-fixtures";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

let base: ReturnType<typeof seedBaseData>;
let fixtures: ReturnType<typeof seatFixtures>;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  fixtures = seatFixtures(testDb, base);
});

describe("getClaimView: the disclosure line", () => {
  it("names the Buyer who will see the claimer's Progress", () => {
    const viewer = fixtures.addStudent("viewer@example.com");
    fixtures.buyTeamPurchase();

    const result = getClaimView("SEAT-1", { userId: viewer.id, country: "US" });

    expect(result).toMatchObject({ ok: true, view: { buyerName: "Test User" } });
  });
});

describe("getStudentCourseNotices", () => {
  it("tells a Seat holder their Progress is visible to the Buyer", () => {
    const holder = fixtures.addStudent("holder@example.com");
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");

    expect(getStudentCourseNotices(holder.id, base.course.id)).toEqual([
      { kind: "progress-visible", buyerName: "Test User" },
    ]);
  });

  it("has no notice for a Student enrolled without a Seat", () => {
    const student = fixtures.addStudent("student@example.com");
    fixtures.buyTeamPurchase();
    fixtures.enroll(student.id);

    expect(getStudentCourseNotices(student.id, base.course.id)).toEqual([]);
  });

  it("has no notice for the Buyer, who bought the Seats but holds none", () => {
    fixtures.buyTeamPurchase();
    fixtures.enroll(base.user.id);

    expect(getStudentCourseNotices(base.user.id, base.course.id)).toEqual([]);
  });

  it("tells a former holder their Seat was Released by the Buyer", () => {
    const holder = fixtures.addStudent("holder@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");

    releaseSeat(base.user.id, seats[0].id);

    expect(getStudentCourseNotices(holder.id, base.course.id)).toEqual([
      { kind: "released", buyerName: "Test User" },
    ]);
  });

  it("drops the Release notice once the former holder has the course again", () => {
    const holder = fixtures.addStudent("holder@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");
    releaseSeat(base.user.id, seats[0].id);

    fixtures.enroll(holder.id);

    expect(getStudentCourseNotices(holder.id, base.course.id)).toEqual([]);
  });

  it("tells a holder only about the course their Seat is on", () => {
    const holder = fixtures.addStudent("holder@example.com");
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");

    expect(getStudentCourseNotices(holder.id, base.course.id + 1)).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RefundRequestStatus } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import { claimSeat } from "./index.server";
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

describe("claimSeat", () => {
  it("gives the claimer an Enrollment in the Seat's course", () => {
    const claimer = fixtures.addStudent("claimer@example.com");
    fixtures.buyTeamPurchase();

    const result = claimSeat("SEAT-1", claimer.id, "US");

    expect(result).toMatchObject({
      ok: true,
      enrollment: { userId: claimer.id, courseId: base.course.id },
      course: { slug: "test-course" },
    });
  });

  it("lets only the first of two claims on a Seat win", () => {
    const first = fixtures.addStudent("first@example.com");
    const second = fixtures.addStudent("second@example.com");
    fixtures.buyTeamPurchase();

    expect(claimSeat("SEAT-1", first.id, "US").ok).toBe(true);
    expect(claimSeat("SEAT-1", second.id, "US")).toEqual({
      ok: false,
      reason: "already-claimed",
    });
  });

  it("refuses while the Buyer's Refund Request is waiting on a decision", () => {
    const claimer = fixtures.addStudent("claimer@example.com");
    const { purchase } = fixtures.buyTeamPurchase();
    fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Requested);

    expect(claimSeat("SEAT-1", claimer.id, "US")).toEqual({
      ok: false,
      reason: "paused",
    });
  });

  it("refuses once the Team Purchase is refunded", () => {
    const claimer = fixtures.addStudent("claimer@example.com");
    const { purchase } = fixtures.buyTeamPurchase();
    fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Approved);

    expect(claimSeat("SEAT-1", claimer.id, "US")).toEqual({
      ok: false,
      reason: "refunded",
    });
  });

  it("can claim again after a Refund Request was declined", () => {
    const claimer = fixtures.addStudent("claimer@example.com");
    const { purchase } = fixtures.buyTeamPurchase();
    fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Declined);

    expect(claimSeat("SEAT-1", claimer.id, "US").ok).toBe(true);
  });

  it("refuses someone already enrolled in the course, leaving the Seat open", () => {
    const enrolled = fixtures.addStudent("enrolled@example.com");
    const other = fixtures.addStudent("other@example.com");
    fixtures.buyTeamPurchase();
    fixtures.enroll(enrolled.id);

    expect(claimSeat("SEAT-1", enrolled.id, "US")).toEqual({
      ok: false,
      reason: "already-enrolled",
    });
    expect(claimSeat("SEAT-1", other.id, "US").ok).toBe(true);
  });

  it("refuses a claim from a country other than the Buyer's", () => {
    const claimer = fixtures.addStudent("claimer@example.com");
    fixtures.buyTeamPurchase({ country: "US" });

    expect(claimSeat("SEAT-1", claimer.id, "DE")).toEqual({
      ok: false,
      reason: "country-mismatch",
    });
    expect(claimSeat("SEAT-1", claimer.id, null)).toEqual({
      ok: false,
      reason: "country-mismatch",
    });
  });

  it("allows a claim from anywhere when the purchase has no country", () => {
    const claimer = fixtures.addStudent("claimer@example.com");
    fixtures.buyTeamPurchase({ country: null });

    expect(claimSeat("SEAT-1", claimer.id, null).ok).toBe(true);
  });

  it("refuses a code that matches no Seat", () => {
    const claimer = fixtures.addStudent("claimer@example.com");
    fixtures.buyTeamPurchase();

    expect(claimSeat("NO-SUCH-SEAT", claimer.id, "US")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

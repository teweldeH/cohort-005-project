import { describe, it, expect, beforeEach, vi } from "vitest";
import { RefundRequestStatus } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import { claimSeat, getTeamRoster } from "./index.server";
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

function rosterFor(buyerId: number) {
  const result = getTeamRoster(buyerId);
  if (!result.ok) throw new Error(`No roster: ${result.reason}`);
  return result.roster;
}

describe("getTeamRoster", () => {
  it("lists each Seat of the Buyer's Team with who claimed it", () => {
    const holder = fixtures.addStudent("holder@example.com");
    fixtures.buyTeamPurchase({ seats: 2 });
    claimSeat("SEAT-1", holder.id, "US");

    expect(rosterFor(base.user.id).seatRows).toEqual([
      expect.objectContaining({
        code: "SEAT-1",
        courseId: base.course.id,
        courseTitle: "Test Course",
        claimedByEmail: "holder@example.com",
        refunded: false,
      }),
      expect.objectContaining({
        code: "SEAT-2",
        claimedByEmail: null,
        refunded: false,
      }),
    ]);
  });

  it("has no roster for someone who only claimed a Seat", () => {
    const holder = fixtures.addStudent("holder@example.com");
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");

    expect(getTeamRoster(holder.id)).toEqual({ ok: false, reason: "no-team" });
  });

  it("shows only the Buyer's own Team", () => {
    const otherBuyer = fixtures.addStudent("other-buyer@example.com");
    fixtures.buyTeamPurchase({ prefix: "MINE" });
    fixtures.buyTeamPurchase({ buyerId: otherBuyer.id, prefix: "THEIRS" });

    expect(rosterFor(base.user.id).seatRows.map((row) => row.code)).toEqual([
      "MINE-1",
      "MINE-2",
    ]);
  });

  it("counts claimed Seats per course and per Team Purchase", () => {
    const holder = fixtures.addStudent("holder@example.com");
    const { purchase } = fixtures.buyTeamPurchase({ seats: 3, amountPaid: 30000 });
    claimSeat("SEAT-1", holder.id, "US");

    const roster = rosterFor(base.user.id);

    expect(roster.courseStats).toEqual([
      {
        courseId: base.course.id,
        courseTitle: "Test Course",
        courseSlug: "test-course",
        totalSeats: 3,
        claimedSeats: 1,
      },
    ]);
    expect(roster.teamPurchases).toEqual([
      {
        purchaseId: purchase.id,
        courseTitle: "Test Course",
        courseSlug: "test-course",
        purchasedAt: purchase.createdAt,
        amount: 30000,
        totalSeats: 3,
        claimedSeats: 1,
        canRequestRefund: false,
        refundRequestStatus: null,
      },
    ]);
  });

  it("offers a Refund Request while no Seat of the purchase is claimed", () => {
    fixtures.buyTeamPurchase();

    expect(rosterFor(base.user.id).teamPurchases[0]).toMatchObject({
      canRequestRefund: true,
      refundRequestStatus: null,
    });
  });

  it("marks a refunded Team Purchase and its Seats", () => {
    const { purchase } = fixtures.buyTeamPurchase();
    fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Approved);

    const roster = rosterFor(base.user.id);

    expect(roster.teamPurchases[0]).toMatchObject({
      canRequestRefund: false,
      refundRequestStatus: RefundRequestStatus.Approved,
    });
    expect(roster.seatRows.map((row) => row.refunded)).toEqual([true, true]);
  });
});

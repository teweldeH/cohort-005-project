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
  it("has one section per Team Purchase with its course, date, price and claimed count", () => {
    const holder = fixtures.addStudent("holder@example.com", "Holly Holder");
    const { purchase } = fixtures.buyTeamPurchase({ seats: 3, amountPaid: 30000 });
    claimSeat("SEAT-1", holder.id, "US");

    expect(rosterFor(base.user.id).purchases).toEqual([
      expect.objectContaining({
        purchaseId: purchase.id,
        course: {
          id: base.course.id,
          title: "Test Course",
          slug: "test-course",
        },
        purchasedAt: purchase.createdAt,
        amount: 30000,
        totalSeats: 3,
        claimedSeats: 1,
      }),
    ]);
  });

  it("lists each Seat as a row: claimed ones with their holder, open ones with their code", () => {
    const holder = fixtures.addStudent("holder@example.com", "Holly Holder");
    const { seats } = fixtures.buyTeamPurchase({ seats: 2 });
    claimSeat("SEAT-1", holder.id, "US");

    expect(rosterFor(base.user.id).purchases[0].seats).toEqual([
      {
        id: seats[0].id,
        code: "SEAT-1",
        status: "claimed",
        holder: { id: holder.id, name: "Holly Holder", email: "holder@example.com" },
        progress: { percent: 0, finished: false, lastActive: null },
        releasable: true,
        releaseBlockedReason: null,
      },
      { id: seats[1].id, code: "SEAT-2", status: "open" },
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

    const codes = rosterFor(base.user.id).purchases.flatMap((purchase) =>
      purchase.seats.map((seat) => seat.code)
    );
    expect(codes).toEqual(["MINE-1", "MINE-2"]);
  });

  it("lists the newest Team Purchase first", () => {
    fixtures.buyTeamPurchase({ prefix: "OLDER", purchasedAt: "2026-01-01T00:00:00.000Z" });
    fixtures.buyTeamPurchase({ prefix: "NEWER", purchasedAt: "2026-02-01T00:00:00.000Z" });

    expect(
      rosterFor(base.user.id).purchases.map((purchase) => purchase.seats[0].code)
    ).toEqual(["NEWER-1", "OLDER-1"]);
  });

  it("offers a Refund Request while no Seat of the purchase is claimed", () => {
    fixtures.buyTeamPurchase();

    expect(rosterFor(base.user.id).purchases[0]).toMatchObject({
      canRequestRefund: true,
      refundRequestStatus: null,
    });
  });

  it("stops offering a Refund Request once a Seat is claimed", () => {
    const holder = fixtures.addStudent("holder@example.com");
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");

    expect(rosterFor(base.user.id).purchases[0].canRequestRefund).toBe(false);
  });

  it("shows the Seats of a refunded Team Purchase as Refunded", () => {
    const { purchase } = fixtures.buyTeamPurchase();
    fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Approved);

    const [section] = rosterFor(base.user.id).purchases;

    expect(section.seats.map((seat) => seat.status)).toEqual([
      "refunded",
      "refunded",
    ]);
    expect(section).toMatchObject({
      canRequestRefund: false,
      refundRequestStatus: RefundRequestStatus.Approved,
    });
  });

  describe("banner", () => {
    function bannerOf() {
      return rosterFor(base.user.id).purchases[0].banner;
    }

    it("warns a Team Purchase is still refundable while no Seat is claimed and no Refund Request exists", () => {
      fixtures.buyTeamPurchase();

      expect(bannerOf()).toBe("still-refundable");
    });

    it("drops the warning once a Seat is claimed", () => {
      const holder = fixtures.addStudent("holder@example.com");
      fixtures.buyTeamPurchase();
      claimSeat("SEAT-1", holder.id, "US");

      expect(bannerOf()).toBeNull();
    });

    it("says the Team Purchase is paused while its Refund Request is Requested", () => {
      const { purchase } = fixtures.buyTeamPurchase();
      fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Requested);

      expect(bannerOf()).toBe("paused");
    });

    it("says the Team Purchase is refunded once its Refund Request is Approved", () => {
      const { purchase } = fixtures.buyTeamPurchase();
      fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Approved);

      expect(bannerOf()).toBe("refunded");
    });

    it("shows no banner after a Refund Request was Declined", () => {
      const { purchase } = fixtures.buyTeamPurchase();
      fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Declined);

      expect(bannerOf()).toBeNull();
    });
  });
});

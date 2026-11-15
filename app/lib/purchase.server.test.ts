import { describe, it, expect, beforeEach, vi } from "vitest";
import * as schema from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  buy,
  getBuyerPurchases,
  getPurchase,
  getStanding,
  quote,
} from "./purchase.server";
import { getTeamRoster, releaseSeat } from "./seats/index.server";
import { seatFixtures } from "./seats/test-fixtures";

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

function addOwnPurchase(createdAt: string) {
  return testDb
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 5000,
      createdAt,
    })
    .returning()
    .get();
}

describe("quote", () => {
  const course = { price: 10000, pppEnabled: true };

  it("charges the full price where PPP gives no discount", () => {
    expect(quote(course, "US")).toEqual({ perSeat: 10000, total: 10000 });
  });

  it("charges the PPP price when the course has PPP enabled", () => {
    // India is in the 50% off tier.
    expect(quote(course, "IN")).toEqual({ perSeat: 5000, total: 5000 });
  });

  it("ignores the country when the course has PPP turned off", () => {
    expect(quote({ ...course, pppEnabled: false }, "IN")).toEqual({
      perSeat: 10000,
      total: 10000,
    });
  });

  it("charges the per-seat price times the number of Seats", () => {
    expect(quote(course, "IN", 3)).toEqual({ perSeat: 5000, total: 15000 });
  });
});

describe("buy", () => {
  function course() {
    return { ...base.course, price: 10000, pppEnabled: true };
  }

  it("buys an Own Purchase at the PPP price", () => {
    const result = buy({
      buyerId: base.user.id,
      course: course(),
      country: "IN",
    });

    if (!result.ok) throw new Error(`Buy refused: ${result.reason}`);
    expect(getPurchase({ id: result.purchase.id })).toMatchObject({
      kind: "own",
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 5000,
      country: "IN",
      standing: "active",
      refundRequestStatus: null,
    });
  });

  it("refuses an Own Purchase while the Buyer is enrolled, and writes nothing", () => {
    // The first Own Purchase started the Enrollment.
    buy({ buyerId: base.user.id, course: course(), country: "US" });

    expect(
      buy({ buyerId: base.user.id, course: course(), country: "US" })
    ).toEqual({ ok: false, reason: "already-enrolled" });
    expect(
      getBuyerPurchases(base.user.id, base.course.id).purchases
    ).toHaveLength(1);
  });

  it("buys a Team Purchase of N Seats at the per-seat price times N", () => {
    const result = buy({
      buyerId: base.user.id,
      course: course(),
      country: "IN",
      seats: 3,
    });

    if (!result.ok) throw new Error(`Buy refused: ${result.reason}`);
    expect(result.purchase).toMatchObject({
      kind: "team",
      amountPaid: 15000,
      seats: { total: 3, claimed: 0, everClaimed: 0 },
    });
  });

  it("allows a Team Purchase while the Buyer is enrolled", () => {
    buy({ buyerId: base.user.id, course: course(), country: "US" });

    expect(
      buy({ buyerId: base.user.id, course: course(), country: "US", seats: 2 })
        .ok
    ).toBe(true);
  });

  it("puts a second Team Purchase on the Buyer's existing Team", () => {
    buy({ buyerId: base.user.id, course: course(), country: "US", seats: 2 });
    buy({ buyerId: base.user.id, course: course(), country: "US", seats: 1 });

    const roster = getTeamRoster(base.user.id);
    if (!roster.ok) throw new Error(`No roster: ${roster.reason}`);
    expect(
      roster.roster.purchases.map((purchase) => purchase.totalSeats)
    ).toEqual(expect.arrayContaining([2, 1]));
  });
});

describe("getPurchase", () => {
  it("counts a Team Purchase's Seats, claimed now and ever claimed", () => {
    const holder = fixtures.addStudent("holder@example.com");
    const leaver = fixtures.addStudent("leaver@example.com");
    const { purchase, seats } = fixtures.buyTeamPurchase({
      seats: 3,
      claimedBy: [holder.id, leaver.id],
    });
    releaseSeat(base.user.id, seats[1].id);

    expect(getPurchase({ id: purchase.id })).toMatchObject({
      kind: "team",
      seats: { total: 3, claimed: 1, everClaimed: 2 },
    });
  });

  it("reads a purchase with no Seats as an Own Purchase", () => {
    const purchase = addOwnPurchase("2026-11-01T10:00:00.000Z");

    const read = getPurchase({ id: purchase.id });

    expect(read?.kind).toBe("own");
    expect(read).not.toHaveProperty("seats");
  });

  it.each([
    [null, "active"],
    [schema.RefundRequestStatus.Requested, "paused"],
    [schema.RefundRequestStatus.Approved, "refunded"],
    [schema.RefundRequestStatus.Declined, "active"],
  ] as const)(
    "gives a purchase whose Refund Request is %s the Standing %s",
    (status, standing) => {
      const { purchase } = fixtures.buyTeamPurchase();
      if (status !== null) fixtures.addRefundRequest(purchase.id, status);

      expect(getPurchase({ id: purchase.id })).toMatchObject({
        standing,
        refundRequestStatus: status,
      });
      expect(getStanding(purchase.id)).toBe(standing);
    }
  );

  it("finds the purchase only when it is the Buyer's, for that course", () => {
    const other = fixtures.addStudent("other@example.com");
    const otherCourse = fixtures.addCourse("other-course");
    const purchase = addOwnPurchase("2026-11-01T10:00:00.000Z");

    expect(
      getPurchase({
        id: purchase.id,
        buyerId: base.user.id,
        courseId: base.course.id,
      })
    ).toBeDefined();
    expect(getPurchase({ id: purchase.id, buyerId: other.id })).toBeUndefined();
    expect(
      getPurchase({ id: purchase.id, courseId: otherCourse.id })
    ).toBeUndefined();
  });

  it("reads inside a caller's transaction", () => {
    testDb.transaction((tx) => {
      const purchase = tx
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          amountPaid: 5000,
        })
        .returning()
        .get();

      expect(getPurchase({ id: purchase.id }, tx)?.kind).toBe("own");
      expect(getStanding(purchase.id, tx)).toBe("active");
    });
  });
});

describe("getBuyerPurchases", () => {
  it("picks the Buyer's Own Purchase over a newer Team Purchase", () => {
    // A Buyer purchases the course for themselves, then buys Seats for their
    // team. Their own access came from the Own Purchase.
    const own = addOwnPurchase("2026-11-01T10:00:00.000Z");
    const { purchase: team } = fixtures.buyTeamPurchase({
      purchasedAt: "2026-11-03T10:00:00.000Z",
    });

    const { purchases, own: found } = getBuyerPurchases(
      base.user.id,
      base.course.id
    );

    expect(found?.id).toBe(own.id);
    expect(purchases.map((purchase) => purchase.id)).toEqual([team.id, own.id]);
  });

  it("picks the latest of the Buyer's Own Purchases, whatever the order", () => {
    const newer = addOwnPurchase("2026-11-05T10:00:00.000Z");
    addOwnPurchase("2026-10-01T10:00:00.000Z");

    expect(getBuyerPurchases(base.user.id, base.course.id).own?.id).toBe(
      newer.id
    );
  });

  it("finds no Own Purchase when the Buyer only has Team Purchases", () => {
    fixtures.buyTeamPurchase();

    expect(getBuyerPurchases(base.user.id, base.course.id).own).toBeUndefined();
  });

  it("finds nothing for someone who never bought the course", () => {
    expect(getBuyerPurchases(base.user.id, base.course.id)).toEqual({
      purchases: [],
      own: undefined,
    });
  });
});

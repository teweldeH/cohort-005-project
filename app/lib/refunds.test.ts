import { describe, it, expect } from "vitest";
import { RefundRequestStatus } from "~/db/schema";
import { checkRefundEligibility, findOwnPurchase } from "./refunds";

describe("findOwnPurchase", () => {
  it("picks the Buyer's Own Purchase over a newer Team Purchase", () => {
    // A Buyer purchases the course for themselves, then buys 5 Seats for their
    // team. The course page is about their own access, so the Team Purchase
    // is not it.
    const own = { id: 1, createdAt: "2026-11-01T10:00:00.000Z", seats: 0 };
    const team = { id: 2, createdAt: "2026-11-03T10:00:00.000Z", seats: 5 };

    expect(findOwnPurchase([own, team])).toBe(own);
  });

  it("picks the latest of the Buyer's Own Purchases, whatever the order", () => {
    const older = { id: 1, createdAt: "2026-10-01T10:00:00.000Z", seats: 0 };
    const newer = { id: 3, createdAt: "2026-11-05T10:00:00.000Z", seats: 0 };

    expect(findOwnPurchase([older, newer])).toBe(newer);
    expect(findOwnPurchase([newer, older])).toBe(newer);
  });

  it("finds nothing when the Buyer only has Team Purchases", () => {
    // Their own access came from a claimed Seat, which nobody paid them for.
    const team = { id: 2, createdAt: "2026-11-03T10:00:00.000Z", seats: 5 };

    expect(findOwnPurchase([team])).toBeUndefined();
    expect(findOwnPurchase([])).toBeUndefined();
  });
});

describe("checkRefundEligibility", () => {
  // An Own Purchase bought on 1 November, in local time, that would be
  // refundable today if nothing else got in the way.
  const learning = {
    kind: "own" as const,
    lessonCount: 10,
    completedLessonCount: 0,
    secondsWatched: 0,
  };
  const facts = {
    purchasedAt: new Date(2026, 10, 1, 23, 0).toISOString(),
    amountPaid: 5000,
    refundRequestStatus: null,
    usage: learning,
  };
  const now = new Date(2026, 10, 5, 12, 0);

  function withLearning(change: Partial<typeof learning>) {
    return { ...facts, usage: { ...learning, ...change } };
  }

  it("lets the Buyer ask for a Refund within the rules", () => {
    expect(checkRefundEligibility(facts, now)).toEqual({
      eligible: true,
      lastDayInWindow: "2026-11-15",
    });
  });

  it("refuses once half the lessons are completed", () => {
    // 60% done with barely anything watched: completion alone decides.
    expect(
      checkRefundEligibility(
        withLearning({ completedLessonCount: 6, secondsWatched: 60 }),
        now
      )
    ).toEqual({ eligible: false, reason: "too-much-completed" });
    expect(
      checkRefundEligibility(withLearning({ completedLessonCount: 5 }), now)
    ).toEqual({ eligible: false, reason: "too-much-completed" });
    expect(
      checkRefundEligibility(withLearning({ completedLessonCount: 4 }), now)
        .eligible
    ).toBe(true);
  });

  it("ignores completion for a course with no lessons", () => {
    expect(
      checkRefundEligibility(withLearning({ lessonCount: 0 }), now).eligible
    ).toBe(true);
  });

  it("refuses once two hours have been watched", () => {
    expect(
      checkRefundEligibility(withLearning({ secondsWatched: 2 * 60 * 60 }), now)
    ).toEqual({ eligible: false, reason: "too-much-watched" });
    expect(
      checkRefundEligibility(
        withLearning({ secondsWatched: 2 * 60 * 60 - 1 }),
        now
      ).eligible
    ).toBe(true);
  });

  it("counts the fourteen-day window in whole days", () => {
    // Bought at 23:00 on 1 November, so the whole of 15 November counts.
    expect(
      checkRefundEligibility(facts, new Date(2026, 10, 15, 23, 59)).eligible
    ).toBe(true);
    expect(checkRefundEligibility(facts, new Date(2026, 10, 16, 0, 0))).toEqual(
      { eligible: false, reason: "window-closed" }
    );
  });

  it("refuses a $0 purchase, which has nothing to refund", () => {
    expect(checkRefundEligibility({ ...facts, amountPaid: 0 }, now)).toEqual({
      eligible: false,
      reason: "free",
    });
  });

  it("refuses while a Refund Request is already open", () => {
    expect(
      checkRefundEligibility(
        { ...facts, refundRequestStatus: RefundRequestStatus.Requested },
        now
      )
    ).toEqual({ eligible: false, reason: "request-open" });
  });

  it("refuses a purchase that has already been refunded", () => {
    expect(
      checkRefundEligibility(
        { ...facts, refundRequestStatus: RefundRequestStatus.Approved },
        now
      )
    ).toEqual({ eligible: false, reason: "refunded" });
  });

  it("refuses again once a Refund Request is Declined, which is final", () => {
    // Still inside the window and barely started, but the decision stands.
    expect(
      checkRefundEligibility(
        { ...facts, refundRequestStatus: RefundRequestStatus.Declined },
        now
      )
    ).toEqual({ eligible: false, reason: "declined" });
  });

  describe("for a Team Purchase", () => {
    function team(claimedSeats: number) {
      return {
        ...facts,
        usage: { kind: "team" as const, seats: 5, claimedSeats },
      };
    }

    it("lets the Buyer ask for a Refund while no Seat is claimed", () => {
      expect(checkRefundEligibility(team(0), now)).toEqual({
        eligible: true,
        lastDayInWindow: "2026-11-15",
      });
    });

    it("refuses once a single Seat is claimed", () => {
      // Refunded whole or not at all, so one claimed Seat keeps all five.
      expect(checkRefundEligibility(team(1), now)).toEqual({
        eligible: false,
        reason: "seat-claimed",
      });
    });

    it("still keeps to the fourteen-day window", () => {
      expect(
        checkRefundEligibility(team(0), new Date(2026, 10, 16, 0, 0))
      ).toEqual({ eligible: false, reason: "window-closed" });
    });
  });
});

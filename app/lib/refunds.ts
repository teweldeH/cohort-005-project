import { RefundRequestStatus } from "~/db/schema";

export type PurchaseWithSeats = {
  id: number;
  createdAt: string;
  seats: number;
};

/** A Team Purchase buys Seats for other people; an Own Purchase buys none. */
export function isTeamPurchase(purchase: Pick<PurchaseWithSeats, "seats">) {
  return purchase.seats > 0;
}

/**
 * The Buyer's latest Own Purchase of a course: the one that gave them their
 * own access. A Team Purchase is never it.
 */
export function findOwnPurchase<T extends PurchaseWithSeats>(
  purchases: T[]
): T | undefined {
  return purchases
    .filter((purchase) => !isTeamPurchase(purchase))
    .reduce<T | undefined>(
      (latest, purchase) =>
        !latest || purchase.createdAt > latest.createdAt ? purchase : latest,
      undefined
    );
}

/** What an Admin can do with a Requested Refund Request. */
export type RefundDecisionOutcome = "approve" | "decline";

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

/** How much of a course a learner has taken. */
export type Learning = {
  lessonCount: number;
  completedLessonCount: number;
  secondsWatched: number;
};

export type OwnPurchaseLimitsCheck =
  | { within: true }
  | { within: false; reason: "too-much-completed" | "too-much-watched" };

/**
 * Whether a learner is within the Own Purchase limits: under half the
 * course's lessons completed and under 2 hours watched. Refund Eligibility
 * holds an Own Purchase's Buyer to them, and a Release its Seat holder.
 */
export function checkOwnPurchaseLimits(
  learning: Learning
): OwnPurchaseLimitsCheck {
  if (
    learning.lessonCount > 0 &&
    learning.completedLessonCount / learning.lessonCount >=
      REFUND_COMPLETION_LIMIT
  ) {
    return { within: false, reason: "too-much-completed" };
  }

  if (learning.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return { within: false, reason: "too-much-watched" };
  }

  return { within: true };
}

/**
 * What is known about a purchase when checking Refund Eligibility. How much
 * of it has been used depends on what was bought: an Own Purchase is used by
 * its Buyer's learning, a Team Purchase by its Seats being claimed.
 */
export type RefundEligibilityFacts = {
  purchasedAt: string;
  amountPaid: number;
  // A purchase has at most one Refund Request: a new one can't be raised
  // while it is open, and once decided the decision stands.
  refundRequestStatus: RefundRequestStatus | null;
  usage:
    | ({ kind: "own" } & Learning)
    | { kind: "team"; seats: number; claimedSeats: number };
};

export type RefundIneligibleReason =
  | "free"
  | "request-open"
  | "refunded"
  | "declined"
  | "window-closed"
  | "too-much-completed"
  | "too-much-watched"
  | "seat-claimed";

export type RefundEligibility =
  | { eligible: true; lastDayInWindow: string }
  | { eligible: false; reason: RefundIneligibleReason };

// The fourteen-day window is counted in whole days, not hours — someone who
// buys at 23:00 should still get the whole of their fourteenth day.
function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

/**
 * Refund Eligibility: whether the Buyer of a purchase may raise a Refund
 * Request for it. The course page and the refund action both ask this.
 */
export function checkRefundEligibility(
  facts: RefundEligibilityFacts,
  now: Date
): RefundEligibility {
  if (facts.amountPaid <= 0) return { eligible: false, reason: "free" };
  switch (facts.refundRequestStatus) {
    case RefundRequestStatus.Requested:
      return { eligible: false, reason: "request-open" };
    case RefundRequestStatus.Approved:
      return { eligible: false, reason: "refunded" };
    case RefundRequestStatus.Declined:
      return { eligible: false, reason: "declined" };
  }

  const windowEnd = new Date(facts.purchasedAt);
  windowEnd.setDate(windowEnd.getDate() + REFUND_WINDOW_DAYS);
  const lastDayInWindow = calendarDay(windowEnd);
  const today = calendarDay(now);
  const purchasedDay = calendarDay(new Date(facts.purchasedAt));

  if (today < purchasedDay || today > lastDayInWindow) {
    return { eligible: false, reason: "window-closed" };
  }

  const { usage } = facts;

  if (usage.kind === "team") {
    // A purchase is refunded whole or not at all, so one claimed Seat rules
    // out the Refund. Nobody learns from an unclaimed Seat, so the Buyer's
    // own learning doesn't count here.
    if (usage.claimedSeats > 0) {
      return { eligible: false, reason: "seat-claimed" };
    }
    return { eligible: true, lastDayInWindow };
  }

  const limits = checkOwnPurchaseLimits(usage);
  if (!limits.within) return { eligible: false, reason: limits.reason };

  return { eligible: true, lastDayInWindow };
}

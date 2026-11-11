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

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

/** What is known about a purchase and its Buyer when checking Refund Eligibility. */
export type RefundEligibilityFacts = {
  purchasedAt: string;
  amountPaid: number;
  seats: number;
  hasOpenRefundRequest: boolean;
  lessonCount: number;
  completedLessonCount: number;
  secondsWatched: number;
};

export type RefundIneligibleReason =
  | "team-purchase"
  | "free"
  | "request-open"
  | "window-closed"
  | "too-much-completed"
  | "too-much-watched";

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
  // Team Purchases get their own way in (#6).
  if (isTeamPurchase(facts))
    return { eligible: false, reason: "team-purchase" };
  if (facts.amountPaid <= 0) return { eligible: false, reason: "free" };
  if (facts.hasOpenRefundRequest) {
    return { eligible: false, reason: "request-open" };
  }

  const windowEnd = new Date(facts.purchasedAt);
  windowEnd.setDate(windowEnd.getDate() + REFUND_WINDOW_DAYS);
  const lastDayInWindow = calendarDay(windowEnd);
  const today = calendarDay(now);
  const purchasedDay = calendarDay(new Date(facts.purchasedAt));

  if (today < purchasedDay || today > lastDayInWindow) {
    return { eligible: false, reason: "window-closed" };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: "too-much-completed" };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: "too-much-watched" };
  }

  return { eligible: true, lastDayInWindow };
}

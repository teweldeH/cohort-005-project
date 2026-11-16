// The eligibility rules for a Refund Request. Kept apart from
// refunds.server.ts so pages can show them without pulling the database into
// the client bundle.

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

// The fourteen-day window is counted in whole days, not hours — someone who
// buys at 23:00 should still get the whole of their fourteenth day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

/** The last calendar day on which a Refund Request can still be raised. */
export function lastDayOfWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

export type RuleBreak =
  | "window_closed"
  | "watched_too_much"
  | "completed_too_much"
  | "seat_claimed";

/** What a Platform Admin sees next to a Refund Request that breaks a rule. */
export const RULE_BREAK_LABELS: Record<RuleBreak, string> = {
  window_closed: `Raised outside the ${REFUND_WINDOW_DAYS}-day window`,
  watched_too_much: `Watched ${REFUND_WATCH_LIMIT_SECONDS / 3600} hours or more`,
  completed_too_much: `Completed ${REFUND_COMPLETION_LIMIT * 100}% of lessons or more`,
  seat_claimed: "A Seat has been claimed",
};

import { splitRevenue } from "~/lib/analytics";
import { calendarDay, lastDayOfWindow } from "~/lib/refund-rules";

// ─── Refund exposure ───
// Gross revenue is reported the moment a purchase lands, but a purchase is
// refundable for fourteen days, so some of what the analytics page calls
// revenue is still the learner's money. This says how much of it is.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ExposurePurchase = {
  courseId: number;
  title: string;
  amountPaid: number;
  createdAt: string;
};

export type ExposedCourse = {
  courseId: number;
  title: string;
  grossCents: number;
  purchaseCount: number;
  daysLeft: number;
};

export type RefundExposure = {
  grossCents: number;
  netCents: number;
  purchaseCount: number;
  sharePercent: number;
  closingTodayCount: number;
  courses: ExposedCourse[];
};

/**
 * The part of `grossCents` still inside its refund window on `now`'s calendar
 * day, from the purchases that made up that gross.
 */
export function computeRefundExposure(
  purchases: ExposurePurchase[],
  grossCents: number,
  now: Date
): RefundExposure {
  const today = calendarDay(now);
  const exposedByCourse = new Map<number, ExposedCourse>();
  let exposedGrossCents = 0;
  let exposedPurchaseCount = 0;
  let closingTodayCount = 0;

  for (const row of purchases) {
    const lastDay = lastDayOfWindow(row.createdAt);
    if (today > lastDay) continue;

    // Whole days between today and the last day the learner may still ask.
    const daysLeft = Math.round(
      (new Date(`${lastDay}T00:00:00.000Z`).getTime() -
        new Date(`${today}T00:00:00.000Z`).getTime()) /
        MS_PER_DAY
    );

    exposedGrossCents += row.amountPaid;
    exposedPurchaseCount += 1;
    if (daysLeft === 0) closingTodayCount += 1;

    const existing = exposedByCourse.get(row.courseId);

    if (existing === undefined) {
      exposedByCourse.set(row.courseId, {
        courseId: row.courseId,
        title: row.title,
        grossCents: row.amountPaid,
        purchaseCount: 1,
        daysLeft,
      });
    } else {
      existing.grossCents += row.amountPaid;
      existing.purchaseCount += 1;
      // The course's headline is its most urgent purchase, not its newest.
      existing.daysLeft = Math.min(existing.daysLeft, daysLeft);
    }
  }

  return {
    grossCents: exposedGrossCents,
    netCents: splitRevenue(exposedGrossCents).netCents,
    purchaseCount: exposedPurchaseCount,
    sharePercent:
      grossCents === 0 ? 0 : Math.round((exposedGrossCents / grossCents) * 100),
    closingTodayCount,
    courses: [...exposedByCourse.values()].sort(
      (a, b) => b.grossCents - a.grossCents
    ),
  };
}

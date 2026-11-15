import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  purchases,
  RefundRequestStatus,
  seats,
} from "~/db/schema";
import { getRefundRequestStatus } from "~/lib/refunds.server";

/** A Seat by its code, with the course and Team Purchase it belongs to. */
export function getSeatByCode(code: string) {
  return db
    .select({ seat: seats, course: courses, purchase: purchases })
    .from(seats)
    .innerJoin(courses, eq(seats.courseId, courses.id))
    .innerJoin(purchases, eq(seats.purchaseId, purchases.id))
    .where(eq(seats.code, code))
    .get();
}

/**
 * Whether a Team Purchase's Seats are paused (its Refund Request is waiting on
 * a decision) or refunded (the request was approved). Neither is stored: both
 * are read from the Refund Request.
 */
export type PurchaseStanding = "active" | "paused" | "refunded";

export function getPurchaseStanding(purchaseId: number): PurchaseStanding {
  const status = getRefundRequestStatus(purchaseId);
  if (status === RefundRequestStatus.Requested) return "paused";
  if (status === RefundRequestStatus.Approved) return "refunded";
  return "active";
}

export function isUserEnrolled(userId: number, courseId: number) {
  const existing = db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();

  return !!existing;
}

/**
 * Seats may only be claimed from the Buyer's country. A purchase with no
 * recorded country can be claimed from anywhere.
 */
export function isCountryMismatch(
  purchase: { country: string | null },
  country: string | null
) {
  return !!purchase.country && purchase.country !== (country ?? "");
}

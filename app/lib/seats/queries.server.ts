import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  purchases,
  RefundRequestStatus,
  seats,
  users,
} from "~/db/schema";
import { getRefundRequestStatus } from "~/lib/refunds.server";
import { normaliseEmail } from "./email";

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
 * A Seat and the Buyer of its Team Purchase. Only that Buyer may Invite to it,
 * withdraw its Invitation or Release it.
 */
export function getSeatWithBuyer(seatId: number) {
  return db
    .select({ seat: seats, buyerId: purchases.userId })
    .from(seats)
    .innerJoin(purchases, eq(seats.purchaseId, purchases.id))
    .where(eq(seats.id, seatId))
    .get();
}

/**
 * Whether a Team Purchase's Seats are paused (its Refund Request is waiting on
 * a decision) or refunded (the request was approved). Neither is stored: both
 * are read from the Refund Request.
 */
export type PurchaseStanding = "active" | "paused" | "refunded";

export function getPurchaseStanding(purchaseId: number): PurchaseStanding {
  return standingFor(getRefundRequestStatus(purchaseId));
}

/** The standing a Team Purchase's latest Refund Request status gives it. */
export function standingFor(
  status: RefundRequestStatus | null
): PurchaseStanding {
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

/**
 * The Invitation on an unclaimed Seat, if it has one, and whether it is for
 * this user. Invited emails are stored normalised, so any letter case of the
 * user's email matches.
 */
export function invitationFor(
  seat: { invitedEmail: string | null },
  userId: number
): { forViewer: boolean } | null {
  if (seat.invitedEmail === null) return null;

  const user = db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  return {
    forViewer: !!user && normaliseEmail(user.email) === seat.invitedEmail,
  };
}

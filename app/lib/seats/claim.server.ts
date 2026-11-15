import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/db";
import { enrollments, seats } from "~/db/schema";
import { refuse, type SeatResult } from "./result";
import {
  getPurchaseStanding,
  getSeatByCode,
  invitationFor,
  isCountryMismatch,
  isUserEnrolled,
} from "./queries.server";

export type ClaimRefusal =
  | "not-found"
  | "already-claimed"
  | "paused"
  | "refunded"
  | "not-invited-email"
  | "already-enrolled"
  | "country-mismatch";

/**
 * Claims a Seat for a user, giving them an Enrollment in its course. The
 * claim is a conditional update inside one transaction, so of two claims on
 * the same Seat only one wins.
 */
export function claimSeat(
  code: string,
  userId: number,
  country: string | null
): SeatResult<
  {
    enrollment: typeof enrollments.$inferSelect;
    course: { id: number; slug: string };
  },
  ClaimRefusal
> {
  const found = getSeatByCode(code);
  if (!found) return refuse("not-found");
  const { seat, course, purchase } = found;

  if (seat.claimedByUserId !== null) return refuse("already-claimed");

  // A claimed Seat rules out a Refund, so no Seat is claimed while the Buyer
  // is waiting on one, and a refunded purchase's Seats are gone for good.
  const standing = getPurchaseStanding(seat.purchaseId);
  if (standing !== "active") return refuse(standing);

  // An invited Seat is held for one person; only their account may claim it.
  const invitation = invitationFor(seat, userId);
  if (invitation && !invitation.forViewer) return refuse("not-invited-email");

  if (isUserEnrolled(userId, seat.courseId)) {
    return refuse("already-enrolled");
  }

  if (isCountryMismatch(purchase, country)) return refuse("country-mismatch");

  return db.transaction((tx) => {
    const claimed = tx
      .update(seats)
      .set({
        claimedByUserId: userId,
        claimedAt: new Date().toISOString(),
        invitedEmail: null,
        invitedAt: null,
      })
      // The code must still be current, so an Invitation made or withdrawn
      // since this claim began wins over it.
      .where(
        and(
          eq(seats.id, seat.id),
          eq(seats.code, code),
          isNull(seats.claimedByUserId)
        )
      )
      .returning({ id: seats.id })
      .get();
    if (!claimed) return refuse("already-claimed");

    const enrollment = tx
      .insert(enrollments)
      .values({ userId, courseId: seat.courseId })
      .returning()
      .get();

    return {
      ok: true,
      enrollment,
      course: { id: course.id, slug: course.slug },
    };
  });
}

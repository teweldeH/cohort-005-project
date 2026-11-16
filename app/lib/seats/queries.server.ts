import { eq } from "drizzle-orm";
import { db, type DbOrTransaction } from "~/db";
import { courses, purchases, seats, users } from "~/db/schema";
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
 * Seats may only be claimed from the Buyer's country. A purchase with no
 * recorded country can be claimed from anywhere.
 */
export function isCountryMismatch(
  purchase: { country: string | null },
  country: string | null
) {
  return Boolean(purchase.country) && purchase.country !== (country ?? "");
}

/**
 * The Invitation on an unclaimed Seat, if it has one, and whether it is for
 * this user. Invited emails are stored normalised, so any letter case of the
 * user's email matches.
 */
export function invitationFor(
  seat: { invitedEmail: string | null },
  userId: number,
  tx: DbOrTransaction = db
): { forViewer: boolean } | null {
  if (seat.invitedEmail === null) return null;

  const user = tx
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  return {
    forViewer:
      user !== undefined && normaliseEmail(user.email) === seat.invitedEmail,
  };
}

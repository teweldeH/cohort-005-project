import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { enrollments, seatReleases, seats } from "~/db/schema";
import { checkOwnPurchaseLimits } from "~/lib/refunds";
import { getLearning, isEnrollmentGivenElsewhere } from "~/lib/refunds.server";
import { newSeatCode } from "./codes.server";
import { getSeatWithBuyer } from "./invitations.server";
import { refuse, type SeatResult } from "./result";

export type ReleaseRefusal =
  | "not-found"
  | "not-buyer"
  | "not-claimed"
  | "past-release-limit";

/**
 * Whether a Seat's holder is within the Release limit: the Own Purchase
 * limits, counting all their learning in the course, whatever gave it.
 */
export function isWithinReleaseLimit(holderId: number, courseId: number) {
  return checkOwnPurchaseLimits(getLearning(holderId, courseId)).within;
}

/**
 * The Buyer takes back a claimed Seat. At once and in one transaction: the
 * Release is recorded, the holder is cleared, the Seat gets a new code (so
 * the old link stops working) and the holder's Enrollment in the course ends,
 * unless something else still gives it. Their Progress and Comments stay.
 */
export function releaseSeat(
  buyerId: number,
  seatId: number
): SeatResult<{ seat: { id: number; code: string } }, ReleaseRefusal> {
  const found = getSeatWithBuyer(seatId);
  if (!found) return refuse("not-found");
  if (found.buyerId !== buyerId) return refuse("not-buyer");

  const { seat } = found;
  const holderId = seat.claimedByUserId;
  if (holderId === null) return refuse("not-claimed");
  if (!isWithinReleaseLimit(holderId, seat.courseId)) {
    return refuse("past-release-limit");
  }

  const released = db.transaction((tx) => {
    const opened = tx
      .update(seats)
      .set({ claimedByUserId: null, claimedAt: null, code: newSeatCode() })
      .where(and(eq(seats.id, seatId), eq(seats.claimedByUserId, holderId)))
      .returning({ id: seats.id, code: seats.code })
      .get();
    if (!opened) return null;

    tx.insert(seatReleases)
      .values({ seatId, formerHolderUserId: holderId })
      .run();

    const learner = { userId: holderId, courseId: seat.courseId };
    if (!isEnrollmentGivenElsewhere(tx, learner)) {
      tx.delete(enrollments)
        .where(
          and(
            eq(enrollments.userId, holderId),
            eq(enrollments.courseId, seat.courseId)
          )
        )
        .run();
    }

    return opened;
  });
  if (!released) return refuse("not-claimed");

  return { ok: true, seat: released };
}

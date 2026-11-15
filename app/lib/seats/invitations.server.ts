import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "~/db";
import { purchases, seats, users } from "~/db/schema";
import { newSeatCode } from "./codes.server";
import { getPurchaseStanding } from "./queries.server";
import { refuse, type SeatResult } from "./result";

export type InviteRefusal =
  | "not-found"
  | "not-buyer"
  | "not-open"
  | "paused"
  | "refunded"
  | "duplicate-invitation";

/**
 * A Seat and the Buyer of its Team Purchase. Only that Buyer may Invite to it
 * or withdraw its Invitation.
 */
function getSeatWithBuyer(seatId: number) {
  return db
    .select({ seat: seats, buyerId: purchases.userId })
    .from(seats)
    .innerJoin(purchases, eq(seats.purchaseId, purchases.id))
    .where(eq(seats.id, seatId))
    .get();
}

/**
 * Whether `email` already holds an Invitation, or holds a claimed Seat, for
 * this course on this Team. Only the Buyer's own Seats are looked at.
 */
function isDuplicateInvitation(
  seat: { teamId: number; courseId: number },
  email: string
) {
  const existing = db
    .select({ id: seats.id })
    .from(seats)
    .leftJoin(users, eq(seats.claimedByUserId, users.id))
    .where(
      and(
        eq(seats.teamId, seat.teamId),
        eq(seats.courseId, seat.courseId),
        or(
          and(isNull(seats.claimedByUserId), eq(seats.invitedEmail, email)),
          eq(sql`lower(${users.email})`, email)
        )
      )
    )
    .get();

  return !!existing;
}

/**
 * Offers an open Seat to one person, named by email. The Seat gets a new
 * code, so links shared for it before stop working.
 */
export function inviteToSeat(
  buyerId: number,
  seatId: number,
  email: string
): SeatResult<{ seat: { id: number; code: string } }, InviteRefusal> {
  const invitedEmail = email.trim().toLowerCase();
  const found = getSeatWithBuyer(seatId);
  if (!found) return refuse("not-found");
  const { seat } = found;
  if (found.buyerId !== buyerId) return refuse("not-buyer");

  if (seat.claimedByUserId !== null || seat.invitedEmail !== null) {
    return refuse("not-open");
  }

  const standing = getPurchaseStanding(seat.purchaseId);
  if (standing !== "active") return refuse(standing);

  if (isDuplicateInvitation(seat, invitedEmail)) {
    return refuse("duplicate-invitation");
  }

  const invited = db
    .update(seats)
    .set({
      invitedEmail,
      invitedAt: new Date().toISOString(),
      code: newSeatCode(),
    })
    .where(
      and(
        eq(seats.id, seatId),
        isNull(seats.claimedByUserId),
        isNull(seats.invitedEmail)
      )
    )
    .returning({ id: seats.id, code: seats.code })
    .get();
  if (!invited) return refuse("not-open");

  return { ok: true, seat: invited };
}

export type WithdrawRefusal = "not-found" | "not-buyer" | "not-invited";

/**
 * Takes back a Seat's Invitation. The Seat is open again with a new code, so
 * the Invitation's link stops working.
 */
export function withdrawInvitation(
  buyerId: number,
  seatId: number
): SeatResult<{ seat: { id: number; code: string } }, WithdrawRefusal> {
  const found = getSeatWithBuyer(seatId);
  if (!found) return refuse("not-found");
  if (found.buyerId !== buyerId) return refuse("not-buyer");

  const withdrawn = db
    .update(seats)
    .set({ invitedEmail: null, invitedAt: null, code: newSeatCode() })
    .where(
      and(
        eq(seats.id, seatId),
        isNull(seats.claimedByUserId),
        isNotNull(seats.invitedEmail)
      )
    )
    .returning({ id: seats.id, code: seats.code })
    .get();
  if (!withdrawn) return refuse("not-invited");

  return { ok: true, seat: withdrawn };
}

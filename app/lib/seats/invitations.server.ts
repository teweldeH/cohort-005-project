import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "~/db";
import { seats, users } from "~/db/schema";
import { newSeatCode } from "./codes.server";
import { normaliseEmail } from "./email";
import { getStanding } from "~/lib/purchase.server";
import { getSeatWithBuyer } from "./queries.server";
import { reopenInvitedSeat } from "./reopen.server";
import { refuse, type SeatResult } from "./result";

export type InviteRefusal =
  | "not-found"
  | "not-buyer"
  | "not-open"
  | "paused"
  | "refunded"
  | "duplicate-invitation";

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

  return Boolean(existing);
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
  const invitedEmail = normaliseEmail(email);
  const found = getSeatWithBuyer(seatId);
  if (!found) return refuse("not-found");
  const { seat } = found;
  if (found.buyerId !== buyerId) return refuse("not-buyer");

  if (seat.claimedByUserId !== null || seat.invitedEmail !== null) {
    return refuse("not-open");
  }

  const standing = getStanding(seat.purchaseId);
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

export type WithdrawRefusal =
  | "not-found"
  | "not-buyer"
  | "paused"
  | "not-invited";

/**
 * Takes back a Seat's Invitation. The Seat is open again with a new code, so
 * the Invitation's link stops working. Refused while a Refund Request is
 * Requested: Invitations are paused, to resume unchanged if it is Declined.
 */
export function withdrawInvitation(
  buyerId: number,
  seatId: number
): SeatResult<{ seat: { id: number; code: string } }, WithdrawRefusal> {
  const found = getSeatWithBuyer(seatId);
  if (!found) return refuse("not-found");
  if (found.buyerId !== buyerId) return refuse("not-buyer");
  if (getStanding(found.seat.purchaseId) === "paused") {
    return refuse("paused");
  }

  const withdrawn = reopenInvitedSeat(seatId);
  if (!withdrawn) return refuse("not-invited");

  return { ok: true, seat: withdrawn };
}

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "~/db";
import { seats } from "~/db/schema";
import { newSeatCode } from "./codes.server";
import { getSeatByCode, invitationFor } from "./queries.server";
import { refuse, type SeatResult } from "./result";

export type TurnDownRefusal = "not-found" | "not-invitee";

/**
 * The invitee refuses their Invitation. The Seat is open again with a new
 * code, so the Invitation's link stops working and the Buyer sees the Seat
 * as open. Only the invited user may Turn down.
 */
export function turnDownInvitation(
  code: string,
  userId: number
): SeatResult<{ seat: { id: number } }, TurnDownRefusal> {
  const found = getSeatByCode(code);
  if (!found) return refuse("not-found");
  const { seat } = found;

  const invitation = invitationFor(seat, userId);
  if (seat.claimedByUserId !== null || !invitation?.forViewer) {
    return refuse("not-invitee");
  }

  const turnedDown = db
    .update(seats)
    .set({ invitedEmail: null, invitedAt: null, code: newSeatCode() })
    // The code must still be current, so a claim, withdrawal or Turn down
    // made since this one began wins over it.
    .where(
      and(
        eq(seats.id, seat.id),
        eq(seats.code, code),
        isNull(seats.claimedByUserId),
        isNotNull(seats.invitedEmail)
      )
    )
    .returning({ id: seats.id })
    .get();
  if (!turnedDown) return refuse("not-found");

  return { ok: true, seat: turnedDown };
}

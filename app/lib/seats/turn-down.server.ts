import { getStanding } from "~/lib/purchase.server";
import { getSeatByCode, invitationFor } from "./queries.server";
import { reopenInvitedSeat } from "./reopen.server";
import { refuse, type SeatResult } from "./result";

export type TurnDownRefusal = "not-found" | "not-invitee" | "paused";

/**
 * The invitee refuses their Invitation. The Seat is open again with a new
 * code, so the Invitation's link stops working and the Buyer sees the Seat
 * as open. Only the invited user may Turn down. Refused while a Refund
 * Request is Requested: Invitations are paused, to resume unchanged if it is
 * Declined.
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
  if (getStanding(seat.purchaseId) === "paused") {
    return refuse("paused");
  }

  const turnedDown = reopenInvitedSeat(seat.id, { currentCode: code });
  if (!turnedDown) return refuse("not-found");

  return { ok: true, seat: { id: turnedDown.id } };
}

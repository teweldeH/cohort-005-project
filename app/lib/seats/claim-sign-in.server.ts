import { getSeatByCode } from "./queries.server";
import { refuse, type SeatResult } from "./result";

/**
 * Where a signed-out visitor to a Seat's link is sent: to log in, with the
 * invited email ready for sign-up when the Seat is held under an Invitation.
 * The link is the Invitation itself, so whoever holds it may see the address.
 */
export function getClaimSignIn(
  code: string
): SeatResult<{ invitedEmail: string | null }, "not-found"> {
  const found = getSeatByCode(code);
  if (!found) return refuse("not-found");
  const { seat } = found;

  return {
    ok: true,
    invitedEmail: seat.claimedByUserId === null ? seat.invitedEmail : null,
  };
}

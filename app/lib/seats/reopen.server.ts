import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "~/db";
import { seats } from "~/db/schema";
import type { Transaction } from "~/db";
import { newSeatCode } from "./codes.server";

/**
 * Opens an invited Seat again: its Invitation is cleared and it gets a new
 * code, so the Invitation's link stops working. Withdrawing, Turning down
 * and a Refund's Approval all end an Invitation this way.
 *
 * Only an unclaimed Seat that still has an Invitation is changed. Pass
 * `currentCode` to also require the code to be unchanged, so a claim,
 * withdrawal or Turn down made in the meantime wins. Returns the Seat's id
 * and new code, or undefined if nothing was changed.
 */
export function reopenInvitedSeat(
  seatId: number,
  {
    currentCode,
    tx,
  }: { currentCode?: string; tx?: Transaction } = {}
) {
  return (tx ?? db)
    .update(seats)
    .set({ invitedEmail: null, invitedAt: null, code: newSeatCode() })
    .where(
      and(
        eq(seats.id, seatId),
        currentCode === undefined ? undefined : eq(seats.code, currentCode),
        isNull(seats.claimedByUserId),
        isNotNull(seats.invitedEmail)
      )
    )
    .returning({ id: seats.id, code: seats.code })
    .get();
}

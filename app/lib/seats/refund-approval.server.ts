import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { seats } from "~/db/schema";
import type { Transaction } from "~/db";
import { reopenInvitedSeat } from "./reopen.server";

/**
 * Withdraws every outstanding Invitation on a Team Purchase whose Refund was
 * just Approved, inside the decision's own transaction. Each Seat gets a new
 * code, as on any withdraw, so the Invitation's link is no longer available.
 *
 * Refunds call this directly rather than through the Seat module's index,
 * which itself reads Refund Request status from the refunds module.
 */
export function withdrawInvitationsOnRefund(
  tx: Transaction,
  purchaseId: number
) {
  const invited = tx
    .select({ id: seats.id })
    .from(seats)
    .where(
      and(
        eq(seats.purchaseId, purchaseId),
        isNull(seats.claimedByUserId),
        isNotNull(seats.invitedEmail)
      )
    )
    .all();

  for (const { id } of invited) {
    reopenInvitedSeat(id, { tx });
  }
}

import { eq } from "drizzle-orm";
import { db } from "~/db";
import { users } from "~/db/schema";
import { refuse, type SeatResult } from "./result";
import {
  getPurchaseStanding,
  getSeatByCode,
  invitationFor,
  isCountryMismatch,
  isUserEnrolled,
} from "./queries.server";

/** Who is looking at a claim page: the signed-in user and where they are. */
export interface ClaimViewer {
  userId: number;
  country: string | null;
}

/**
 * The Invitation a Seat is held under, as the viewer may see it: only whether
 * it is for them, never whose address it is for.
 */
export interface ClaimInvitation {
  forViewer: boolean;
}

/** What the claim page shows for a Seat code. */
export interface ClaimView {
  course: { id: number; title: string; slug: string };
  code: string;
  /** Null for an open Seat, which anyone with the link may claim. */
  invitation: ClaimInvitation | null;
  /** Who will see the claimer's Progress: the disclosure line names them. */
  buyerName: string;
  alreadyClaimed: boolean;
  alreadyEnrolled: boolean;
  paused: boolean;
  refunded: boolean;
  countryMismatch: boolean;
  /** The only country the Seat can be claimed from, if the purchase has one. */
  buyerCountry: string | null;
}

function getBuyerName(buyerId: number) {
  const buyer = db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, buyerId))
    .get();

  return buyer?.name ?? "the Buyer";
}

export type ClaimViewRefusal = "not-found";

/**
 * What the claim page needs to show a signed-in viewer for a Seat code. An
 * unknown code (including one replaced when an Invitation was made or
 * withdrawn) is refused. A signed-out visitor gets `getClaimSignIn` instead.
 */
export function getClaimView(
  code: string,
  viewer: ClaimViewer
): SeatResult<{ view: ClaimView }, ClaimViewRefusal> {
  const found = getSeatByCode(code);
  if (!found) return refuse("not-found");
  const { seat, course, purchase } = found;

  const alreadyClaimed = seat.claimedByUserId !== null;
  const alreadyEnrolled = isUserEnrolled(viewer.userId, seat.courseId);
  // A claimed Seat is simply taken, whatever became of its purchase since.
  const standing = alreadyClaimed
    ? "active"
    : getPurchaseStanding(seat.purchaseId);

  return {
    ok: true,
    view: {
      course: { id: course.id, title: course.title, slug: course.slug },
      code,
      invitation: invitationFor(seat, viewer.userId),
      buyerName: getBuyerName(purchase.userId),
      alreadyClaimed,
      alreadyEnrolled,
      paused: standing === "paused",
      refunded: standing === "refunded",
      countryMismatch:
        !alreadyClaimed &&
        !alreadyEnrolled &&
        isCountryMismatch(purchase, viewer.country),
      buyerCountry: purchase.country,
    },
  };
}

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
  alreadyClaimed: boolean;
  alreadyEnrolled: boolean;
  paused: boolean;
  refunded: boolean;
  countryMismatch: boolean;
}

export type ClaimViewRefusal = "not-found" | "signed-out";

/**
 * What the claim page needs to show a viewer for a Seat code. An unknown code
 * (including one replaced when an Invitation was made or withdrawn) is
 * reported before asking a signed-out visitor to sign in.
 */
export function getClaimView(
  code: string,
  viewer: ClaimViewer | null
): SeatResult<{ view: ClaimView }, ClaimViewRefusal> {
  const found = getSeatByCode(code);
  if (!found) return refuse("not-found");
  if (!viewer) return refuse("signed-out");
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
      alreadyClaimed,
      alreadyEnrolled,
      paused: standing === "paused",
      refunded: standing === "refunded",
      countryMismatch:
        !alreadyClaimed &&
        !alreadyEnrolled &&
        isCountryMismatch(purchase, viewer.country),
    },
  };
}

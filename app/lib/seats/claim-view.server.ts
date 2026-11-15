import { eq } from "drizzle-orm";
import { db } from "~/db";
import { users } from "~/db/schema";
import { refuse, type SeatResult } from "./result";
import {
  getPurchaseStanding,
  getSeatByCode,
  isCountryMismatch,
  isUserEnrolled,
} from "./queries.server";

/** Who is looking at a claim page: the signed-in user and where they are. */
export interface ClaimViewer {
  userId: number;
  country: string | null;
}

/** What the claim page shows for a Seat code. */
export interface ClaimView {
  course: { id: number; title: string; slug: string };
  code: string;
  /** Who will see the claimer's Progress: the disclosure line names them. */
  buyerName: string;
  alreadyClaimed: boolean;
  alreadyEnrolled: boolean;
  paused: boolean;
  refunded: boolean;
  countryMismatch: boolean;
}

function getBuyerName(buyerId: number) {
  const buyer = db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, buyerId))
    .get();

  return buyer?.name ?? "the Buyer";
}

export type ClaimViewRefusal = "not-found" | "signed-out";

/**
 * What the claim page needs to show a viewer for a Seat code. An unknown code
 * is reported before asking a signed-out visitor to sign in.
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
      buyerName: getBuyerName(purchase.userId),
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

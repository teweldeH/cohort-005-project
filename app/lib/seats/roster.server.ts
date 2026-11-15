import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courses, purchases, seats, users, type RefundRequestStatus } from "~/db/schema";
import {
  getRefundEligibility,
  getRefundRequestStatus,
} from "~/lib/refunds.server";
import { getTeamForBuyer } from "~/lib/teams.server";
import { getSeatProgress, type SeatProgress } from "./progress.server";
import { standingFor, type PurchaseStanding } from "./queries.server";
import { isWithinReleaseLimit } from "./release.server";
import { refuse, type SeatResult } from "./result";

/** The person holding a claimed Seat. */
export interface SeatHolder {
  id: number;
  name: string;
  email: string;
}

/** What every Seat on the roster carries, whatever its status. */
interface RosterSeatBase {
  id: number;
  code: string;
}

/**
 * One Seat on the roster. Its status is derived, never stored: claimed when
 * someone holds it, refunded when its Team Purchase was refunded, invited
 * while it is offered to one person by email (invited-paused while a Refund
 * Request is Requested), otherwise open. Each state carries only its fields.
 */
export type RosterSeat = RosterSeatBase &
  (
    | { status: "open" }
    | {
        status: "invited" | "invited-paused";
        invitedEmail: string;
        invitedAt: string;
      }
    | { status: "refunded" }
    | {
        status: "claimed";
        holder: SeatHolder;
        progress: SeatProgress;
        releasable: boolean;
        releaseBlockedReason: "past-release-limit" | null;
      }
  );

export type RosterSeatStatus = RosterSeat["status"];

/**
 * The one purchase-wide notice a section shows: refunded (its Seats can no
 * longer be claimed), paused (a Refund Request is waiting on a decision), or
 * still-refundable (claiming any Seat will end Refund Eligibility).
 */
export type RosterBanner = "refunded" | "paused" | "still-refundable" | null;

/** One Team Purchase and its Seats: one section of the Team page. */
export interface RosterPurchase {
  banner: RosterBanner;
  purchaseId: number;
  course: { id: number; title: string; slug: string };
  purchasedAt: string;
  amount: number;
  totalSeats: number;
  claimedSeats: number;
  canRequestRefund: boolean;
  refundRequestStatus: RefundRequestStatus | null;
  seats: RosterSeat[];
}

export interface TeamRoster {
  purchases: RosterPurchase[];
}

export type TeamRosterRefusal = "no-team";

function getTeamSeats(teamId: number) {
  return db
    .select({
      seat: seats,
      holder: { id: users.id, name: users.name, email: users.email },
    })
    .from(seats)
    .leftJoin(users, eq(seats.claimedByUserId, users.id))
    .where(eq(seats.teamId, teamId))
    .orderBy(asc(seats.id))
    .all();
}

type TeamSeat = ReturnType<typeof getTeamSeats>[number];

function getBuyerPurchases(buyerId: number, purchaseIds: number[]) {
  if (purchaseIds.length === 0) return [];

  return db
    .select({ purchase: purchases, course: courses })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(
      and(eq(purchases.userId, buyerId), inArray(purchases.id, purchaseIds))
    )
    .all();
}

function toRosterSeat(
  { seat, holder }: TeamSeat,
  standing: PurchaseStanding
): RosterSeat {
  const base: RosterSeatBase = { id: seat.id, code: seat.code };
  if (holder) {
    const releasable = isWithinReleaseLimit(holder.id, seat.courseId);
    return {
      ...base,
      status: "claimed",
      holder,
      progress: getSeatProgress(holder.id, seat.courseId),
      releasable,
      releaseBlockedReason: releasable ? null : "past-release-limit",
    };
  }
  if (standing === "refunded") return { ...base, status: "refunded" };
  if (seat.invitedEmail !== null) {
    return {
      ...base,
      status: standing === "paused" ? "invited-paused" : "invited",
      invitedEmail: seat.invitedEmail,
      invitedAt: seat.invitedAt ?? seat.createdAt,
    };
  }
  return { ...base, status: "open" };
}

/**
 * Refund Eligibility already means no Seat claimed and no Refund Request, so
 * the still-refundable warning follows it (and so follows #62's "ever
 * claimed" once Refund Eligibility counts Released Seats).
 */
function bannerFor(
  standing: PurchaseStanding,
  canRequestRefund: boolean
): RosterBanner {
  if (standing === "refunded") return "refunded";
  if (standing === "paused") return "paused";
  return canRequestRefund ? "still-refundable" : null;
}

/**
 * The Team page for a Buyer, built only from their own Team: one entry per
 * Team Purchase, newest first, each with one entry per Seat.
 */
export function getTeamRoster(
  buyerId: number
): SeatResult<{ roster: TeamRoster }, TeamRosterRefusal> {
  const team = getTeamForBuyer(buyerId);
  if (!team) return refuse("no-team");

  const teamSeats = getTeamSeats(team.id);
  const purchaseIds = [...new Set(teamSeats.map(({ seat }) => seat.purchaseId))];

  const rosterPurchases = getBuyerPurchases(buyerId, purchaseIds)
    .map(({ purchase, course }): RosterPurchase => {
      const refundRequestStatus = getRefundRequestStatus(purchase.id);
      const standing = standingFor(refundRequestStatus);
      const purchaseSeats = teamSeats
        .filter(({ seat }) => seat.purchaseId === purchase.id)
        .map((teamSeat) => toRosterSeat(teamSeat, standing));
      const canRequestRefund = getRefundEligibility(
        purchase,
        buyerId,
        purchase.courseId
      ).eligible;

      return {
        purchaseId: purchase.id,
        banner: bannerFor(standing, canRequestRefund),
        course: { id: course.id, title: course.title, slug: course.slug },
        purchasedAt: purchase.createdAt,
        amount: purchase.amountPaid,
        totalSeats: purchaseSeats.length,
        claimedSeats: purchaseSeats.filter((seat) => seat.status === "claimed")
          .length,
        canRequestRefund,
        refundRequestStatus,
        seats: purchaseSeats,
      };
    })
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));

  return { ok: true, roster: { purchases: rosterPurchases } };
}

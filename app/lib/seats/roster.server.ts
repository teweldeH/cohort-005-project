import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  purchases,
  seats,
  users,
  RefundRequestStatus,
} from "~/db/schema";
import {
  getRefundEligibility,
  getRefundRequestStatus,
} from "~/lib/refunds.server";
import { getTeamForBuyer } from "~/lib/teams.server";
import { refuse, type SeatResult } from "./result";

/** Seats claimed out of bought, for one course on the Team. */
export interface CourseStats {
  courseId: number;
  courseTitle: string;
  courseSlug: string;
  totalSeats: number;
  claimedSeats: number;
}

/** One of the Buyer's Team Purchases, refunded whole or not at all. */
export interface TeamPurchaseRow {
  purchaseId: number;
  courseTitle: string;
  courseSlug: string;
  purchasedAt: string;
  amount: number;
  totalSeats: number;
  claimedSeats: number;
  canRequestRefund: boolean;
  refundRequestStatus: RefundRequestStatus | null;
}

/** One Seat on the Team. */
export interface SeatRow {
  id: number;
  code: string;
  courseId: number;
  courseTitle: string;
  claimedByEmail: string | null;
  refunded: boolean;
  createdAt: string;
}

export interface TeamRoster {
  courseStats: CourseStats[];
  teamPurchases: TeamPurchaseRow[];
  seatRows: SeatRow[];
}

export type TeamRosterRefusal = "no-team";

function getTeamSeats(teamId: number) {
  return db
    .select({
      seat: seats,
      course: { title: courses.title, slug: courses.slug },
      claimedByEmail: users.email,
    })
    .from(seats)
    .innerJoin(courses, eq(seats.courseId, courses.id))
    .leftJoin(users, eq(seats.claimedByUserId, users.id))
    .where(eq(seats.teamId, teamId))
    .orderBy(asc(seats.id))
    .all();
}

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

/**
 * The Team page for a Buyer, built only from their own Team: Seats claimed
 * per course, their Team Purchases and every Seat.
 */
export function getTeamRoster(
  buyerId: number
): SeatResult<{ roster: TeamRoster }, TeamRosterRefusal> {
  const team = getTeamForBuyer(buyerId);
  if (!team) return refuse("no-team");

  const teamSeats = getTeamSeats(team.id);
  const purchaseIds = [...new Set(teamSeats.map(({ seat }) => seat.purchaseId))];
  const refundRequestStatuses = new Map(
    purchaseIds.map((id) => [id, getRefundRequestStatus(id)])
  );

  const courseStats = new Map<number, CourseStats>();
  for (const { seat, course } of teamSeats) {
    const stats = courseStats.get(seat.courseId) ?? {
      courseId: seat.courseId,
      courseTitle: course.title,
      courseSlug: course.slug,
      totalSeats: 0,
      claimedSeats: 0,
    };
    stats.totalSeats++;
    if (seat.claimedByUserId !== null) stats.claimedSeats++;
    courseStats.set(seat.courseId, stats);
  }

  const seatRows: SeatRow[] = teamSeats.map(({ seat, course, claimedByEmail }) => ({
    id: seat.id,
    code: seat.code,
    courseId: seat.courseId,
    courseTitle: course.title,
    claimedByEmail,
    refunded:
      refundRequestStatuses.get(seat.purchaseId) ===
      RefundRequestStatus.Approved,
    createdAt: seat.createdAt,
  }));

  const teamPurchases: TeamPurchaseRow[] = getBuyerPurchases(buyerId, purchaseIds)
    .map(({ purchase, course }) => {
      const purchaseSeats = teamSeats.filter(
        ({ seat }) => seat.purchaseId === purchase.id
      );
      return {
        purchaseId: purchase.id,
        courseTitle: course.title,
        courseSlug: course.slug,
        purchasedAt: purchase.createdAt,
        amount: purchase.amountPaid,
        totalSeats: purchaseSeats.length,
        claimedSeats: purchaseSeats.filter(
          ({ seat }) => seat.claimedByUserId !== null
        ).length,
        canRequestRefund: getRefundEligibility(purchase, buyerId, purchase.courseId)
          .eligible,
        refundRequestStatus: refundRequestStatuses.get(purchase.id) ?? null,
      };
    })
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));

  return {
    ok: true,
    roster: { courseStats: [...courseStats.values()], teamPurchases, seatRows },
  };
}

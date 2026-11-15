import { and, desc, eq } from "drizzle-orm";
import { db } from "~/db";
import { purchases, seatReleases, seats, users } from "~/db/schema";
import { isUserEnrolled } from "./queries.server";

/**
 * What the course page tells a Student about their Seat on that course. While
 * they hold a Seat, the Buyer can see their Progress. Once a Seat is Released
 * and they have no access, they're told who Released it.
 */
export type StudentCourseNotice =
  | { kind: "progress-visible"; buyerName: string }
  | { kind: "released"; buyerName: string };

/** The name of the Buyer whose Seat the user holds on a course, if any. */
function getHeldSeatBuyerName(userId: number, courseId: number) {
  const held = db
    .select({ buyerName: users.name })
    .from(seats)
    .innerJoin(purchases, eq(seats.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(and(eq(seats.claimedByUserId, userId), eq(seats.courseId, courseId)))
    .get();

  return held?.buyerName ?? null;
}

/** The Buyer who most recently Released a Seat the user held on a course. */
function getLatestReleaseBuyerName(userId: number, courseId: number) {
  const release = db
    .select({ buyerName: users.name })
    .from(seatReleases)
    .innerJoin(seats, eq(seatReleases.seatId, seats.id))
    .innerJoin(purchases, eq(seats.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(
      and(
        eq(seatReleases.formerHolderUserId, userId),
        eq(seats.courseId, courseId)
      )
    )
    .orderBy(desc(seatReleases.releasedAt), desc(seatReleases.id))
    .get();

  return release?.buyerName ?? null;
}

/** The notices for a Student on a course, in the order the page shows them. */
export function getStudentCourseNotices(
  userId: number,
  courseId: number
): StudentCourseNotice[] {
  const notices: StudentCourseNotice[] = [];

  const buyerName = getHeldSeatBuyerName(userId, courseId);
  if (buyerName !== null) {
    notices.push({ kind: "progress-visible", buyerName });
  }

  if (!isUserEnrolled(userId, courseId)) {
    const releasedBy = getLatestReleaseBuyerName(userId, courseId);
    if (releasedBy !== null) {
      notices.push({ kind: "released", buyerName: releasedBy });
    }
  }

  return notices;
}

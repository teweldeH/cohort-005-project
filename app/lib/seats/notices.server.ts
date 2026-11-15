import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { purchases, seats, users } from "~/db/schema";

/**
 * What the course page tells a Student about their Seat on that course. While
 * they hold a Seat, the Buyer can see their Progress. (#62 adds the notice a
 * former holder gets after a Release.)
 */
export type StudentCourseNotice = { kind: "progress-visible"; buyerName: string };

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

  return notices;
}

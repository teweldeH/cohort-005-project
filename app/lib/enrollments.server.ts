import { and, eq } from "drizzle-orm";
import { db, type DbOrTransaction } from "~/db";
import { enrollments } from "~/db/schema";

/** Whether a user has an Enrollment in a course. */
export function isUserEnrolled(
  userId: number,
  courseId: number,
  tx: DbOrTransaction = db
) {
  return !!tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

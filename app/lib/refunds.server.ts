import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  refunds,
  RefundStatus,
  videoWatchEvents,
} from "~/db/schema";
import { checkRefundEligibility } from "~/lib/refunds";

function getSeatCount(purchaseId: number) {
  const result = db
    .select({ seats: sql<number>`count(*)` })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchaseId))
    .get();

  return result?.seats ?? 0;
}

function hasOpenRefundRequest(purchaseId: number) {
  const request = db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.purchaseId, purchaseId),
        eq(refunds.status, RefundStatus.Requested)
      )
    )
    .get();

  return !!request;
}

function getLessonIdsForCourse(courseId: number): number[] {
  const rows = db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all();

  return rows.map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

// Watched time is the furthest point reached in each lesson, added up, so
// rewatching a lesson doesn't count twice.
function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

/** Refund Eligibility for a Buyer's purchase of a course, read from the database. */
export function getRefundEligibility(
  purchase: { id: number; createdAt: string; amountPaid: number },
  buyerId: number,
  courseId: number
) {
  const lessonIds = getLessonIdsForCourse(courseId);

  return checkRefundEligibility(
    {
      purchasedAt: purchase.createdAt,
      amountPaid: purchase.amountPaid,
      seats: getSeatCount(purchase.id),
      hasOpenRefundRequest: hasOpenRefundRequest(purchase.id),
      lessonCount: lessonIds.length,
      completedLessonCount: getCompletedLessonCount(buyerId, lessonIds),
      secondsWatched: getSecondsWatched(buyerId, lessonIds),
    },
    new Date()
  );
}

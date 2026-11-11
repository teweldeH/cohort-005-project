import { and, desc, eq, inArray, ne, notExists, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  seats,
  enrollments,
  purchases,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  refundRequests,
  RefundRequestStatus,
  videoWatchEvents,
} from "~/db/schema";
import {
  checkRefundEligibility,
  isTeamPurchase,
  type RefundDecisionOutcome,
} from "~/lib/refunds";

/** How many Seats a purchase covers, and how many of them are claimed. */
export function getSeatCounts(purchaseId: number) {
  const result = db
    .select({
      seats: sql<number>`count(*)`,
      claimedSeats: sql<number>`count(${seats.claimedByUserId})`,
    })
    .from(seats)
    .where(eq(seats.purchaseId, purchaseId))
    .get();

  return { seats: result?.seats ?? 0, claimedSeats: result?.claimedSeats ?? 0 };
}

/** The status of a purchase's Refund Request, or null if it has none. */
export function getRefundRequestStatus(purchaseId: number) {
  const request = db
    .select({ status: refundRequests.status })
    .from(refundRequests)
    .where(eq(refundRequests.purchaseId, purchaseId))
    .orderBy(desc(refundRequests.id))
    .get();

  return request?.status ?? null;
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
  return checkRefundEligibility(
    {
      purchasedAt: purchase.createdAt,
      amountPaid: purchase.amountPaid,
      refundRequestStatus: getRefundRequestStatus(purchase.id),
      usage: getUsage(purchase.id, buyerId, courseId),
    },
    new Date()
  );
}

/** How much of a purchase has been used, as Refund Eligibility measures it. */
export function getUsage(purchaseId: number, buyerId: number, courseId: number) {
  const seatCounts = getSeatCounts(purchaseId);

  if (isTeamPurchase(seatCounts)) {
    return { kind: "team" as const, ...seatCounts };
  }

  return { kind: "own" as const, ...getBuyerLearning(buyerId, courseId) };
}

/** How much of a course its Buyer has taken, as Refund Eligibility measures it. */
function getBuyerLearning(buyerId: number, courseId: number) {
  const lessonIds = getLessonIdsForCourse(courseId);

  return {
    lessonCount: lessonIds.length,
    completedLessonCount: getCompletedLessonCount(buyerId, lessonIds),
    secondsWatched: getSecondsWatched(buyerId, lessonIds),
  };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Whether the Buyer's Enrollment in a course comes from somewhere other than
 * this purchase: another Own Purchase not refunded, or a Seat they claimed.
 */
function isEnrollmentGivenElsewhere(
  tx: Transaction,
  purchase: { id: number; userId: number; courseId: number }
) {
  const claimedSeat = tx
    .select({ id: seats.id })
    .from(seats)
    .where(
      and(
        eq(seats.claimedByUserId, purchase.userId),
        eq(seats.courseId, purchase.courseId)
      )
    )
    .get();

  if (claimedSeat) return true;

  const otherOwnPurchase = tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, purchase.userId),
        eq(purchases.courseId, purchase.courseId),
        ne(purchases.id, purchase.id),
        notExists(
          tx
            .select({ id: seats.id })
            .from(seats)
            .where(eq(seats.purchaseId, purchases.id))
        ),
        notExists(
          tx
            .select({ id: refundRequests.id })
            .from(refundRequests)
            .where(
              and(
                eq(refundRequests.purchaseId, purchases.id),
                eq(refundRequests.status, RefundRequestStatus.Approved)
              )
            )
        )
      )
    )
    .get();

  return !!otherOwnPurchase;
}

export type RefundDecision =
  | { outcome: Extract<RefundDecisionOutcome, "approve">; note: string | null }
  | { outcome: Extract<RefundDecisionOutcome, "decline">; note: string };

/**
 * An Admin's decision on a Requested Refund Request. Approving records the
 * Refund and ends what the purchase gave: the Buyer's Enrollment for an Own
 * Purchase, unless another Own Purchase or a claimed Seat still gives it. A
 * Team Purchase's Seats end with the Approval itself, since a Seat can't be
 * claimed once its purchase is refunded.
 *
 * Returns false if the Refund Request was no longer Requested, for instance
 * because another Admin decided it first.
 */
export function decideRefundRequest(
  refundRequestId: number,
  purchase: {
    id: number;
    userId: number;
    courseId: number;
    amountPaid: number;
  },
  decision: RefundDecision,
  adminId: number
) {
  const approved = decision.outcome === "approve";

  return db.transaction((tx) => {
    const decided = tx
      .update(refundRequests)
      .set({
        status: approved ? RefundRequestStatus.Approved : RefundRequestStatus.Declined,
        amountRefunded: approved ? purchase.amountPaid : null,
        decisionNote: decision.note,
        resolvedAt: new Date().toISOString(),
        resolvedByUserId: adminId,
      })
      .where(
        and(
          eq(refundRequests.id, refundRequestId),
          eq(refundRequests.status, RefundRequestStatus.Requested)
        )
      )
      .returning({ id: refundRequests.id })
      .get();

    if (!decided) return false;

    if (
      approved &&
      !isTeamPurchase(getSeatCounts(purchase.id)) &&
      !isEnrollmentGivenElsewhere(tx, purchase)
    ) {
      tx.delete(enrollments)
        .where(
          and(
            eq(enrollments.userId, purchase.userId),
            eq(enrollments.courseId, purchase.courseId)
          )
        )
        .run();
    }

    return true;
  });
}

import { and, desc, eq, inArray, ne, notExists, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  seats,
  seatReleases,
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
  type Learning,
  type RefundDecisionOutcome,
} from "~/lib/refunds";

/**
 * How many Seats a purchase covers, how many are claimed now, and how many
 * were ever claimed: claimed now, or claimed once and since Released.
 */
export function getSeatCounts(purchaseId: number) {
  const everClaimed = sql`${seats.claimedByUserId} is not null or exists (
    select 1 from ${seatReleases} where ${seatReleases.seatId} = ${seats.id}
  )`;
  const result = db
    .select({
      seats: sql<number>`count(*)`,
      claimedSeats: sql<number>`count(${seats.claimedByUserId})`,
      everClaimedSeats: sql<number>`count(case when ${everClaimed} then 1 end)`,
    })
    .from(seats)
    .where(eq(seats.purchaseId, purchaseId))
    .get();

  return {
    seats: result?.seats ?? 0,
    claimedSeats: result?.claimedSeats ?? 0,
    everClaimedSeats: result?.everClaimedSeats ?? 0,
  };
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

/** The ids of every lesson in a course. */
export function getLessonIdsForCourse(courseId: number): number[] {
  const rows = db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all();

  return rows.map((row) => row.id);
}

/** How many of the given lessons a user has completed. */
export function getCompletedLessonCount(userId: number, lessonIds: number[]) {
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
export function getSecondsWatched(userId: number, lessonIds: number[]) {
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

  return { kind: "own" as const, ...getLearning(buyerId, courseId) };
}

/**
 * How much of a course a learner has taken, as the Own Purchase limits
 * measure it.
 */
export function getLearning(userId: number, courseId: number): Learning {
  const lessonIds = getLessonIdsForCourse(courseId);

  return {
    lessonCount: lessonIds.length,
    completedLessonCount: getCompletedLessonCount(userId, lessonIds),
    secondsWatched: getSecondsWatched(userId, lessonIds),
  };
}

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Whether a learner's Enrollment in a course is still given by something:
 * a Seat they hold, or an Own Purchase not refunded. `exceptPurchaseId` is
 * the purchase being refunded, which no longer counts.
 */
export function isEnrollmentGivenElsewhere(
  tx: Transaction,
  learner: { userId: number; courseId: number },
  exceptPurchaseId: number | null = null
) {
  const claimedSeat = tx
    .select({ id: seats.id })
    .from(seats)
    .where(
      and(
        eq(seats.claimedByUserId, learner.userId),
        eq(seats.courseId, learner.courseId)
      )
    )
    .get();

  if (claimedSeat) return true;

  const otherOwnPurchase = tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, learner.userId),
        eq(purchases.courseId, learner.courseId),
        exceptPurchaseId === null
          ? undefined
          : ne(purchases.id, exceptPurchaseId),
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
      !isEnrollmentGivenElsewhere(tx, purchase, purchase.id)
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

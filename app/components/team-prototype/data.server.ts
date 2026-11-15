// PROTOTYPE — Seat management v1 Team page (#53). Throwaway: lives on the
// prototype/team-page-seat-management branch only, never merged.
//
// Read-only. Progress and the Release limit are computed from the real
// database; Invitations don't exist yet, so one open Seat per purchase is
// pretended to be invited.
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  purchases,
  quizAttempts,
  RefundRequestStatus,
  seats,
  users,
  videoWatchEvents,
} from "~/db/schema";
import { getRefundRequestStatus } from "~/lib/refunds.server";
import {
  REFUND_COMPLETION_LIMIT,
  REFUND_WATCH_LIMIT_SECONDS,
} from "~/lib/refunds";
import type { ProtoPurchase, ProtoSeat } from "./types";

const MOCK_INVITEES = [
  "priya.shah@example.com",
  "tom.becker@example.com",
  "amara.osei@example.com",
];

function lessonIdsFor(courseId: number) {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((r) => r.id);
}

function holderProgress(userId: number, courseId: number, lessonIds: number[]) {
  const completed =
    lessonIds.length === 0
      ? 0
      : (db
          .select({ n: sql<number>`count(*)` })
          .from(lessonProgress)
          .where(
            and(
              eq(lessonProgress.userId, userId),
              eq(lessonProgress.status, LessonProgressStatus.Completed),
              inArray(lessonProgress.lessonId, lessonIds)
            )
          )
          .get()?.n ?? 0);

  const furthest =
    lessonIds.length === 0
      ? []
      : db
          .select({ f: sql<number>`max(${videoWatchEvents.positionSeconds})` })
          .from(videoWatchEvents)
          .where(
            and(
              eq(videoWatchEvents.userId, userId),
              inArray(videoWatchEvents.lessonId, lessonIds)
            )
          )
          .groupBy(videoWatchEvents.lessonId)
          .all();
  const secondsWatched = furthest.reduce((t, r) => t + r.f, 0);

  const lastLesson =
    lessonIds.length === 0
      ? null
      : db
          .select({ at: max(lessonProgress.completedAt) })
          .from(lessonProgress)
          .where(
            and(
              eq(lessonProgress.userId, userId),
              inArray(lessonProgress.lessonId, lessonIds)
            )
          )
          .get()?.at;
  const lastWatch =
    lessonIds.length === 0
      ? null
      : db
          .select({ at: max(videoWatchEvents.createdAt) })
          .from(videoWatchEvents)
          .where(
            and(
              eq(videoWatchEvents.userId, userId),
              inArray(videoWatchEvents.lessonId, lessonIds)
            )
          )
          .get()?.at;
  const lastQuiz = db
    .select({ at: max(quizAttempts.attemptedAt) })
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, userId))
    .get()?.at;
  const lastActive =
    [lastLesson, lastWatch, lastQuiz]
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null;

  const finished = !!db
    .select({ at: enrollments.completedAt })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get()?.at;

  const fraction = lessonIds.length ? completed / lessonIds.length : 0;
  return {
    percent: Math.round(fraction * 100),
    finished: finished || fraction === 1,
    lastActive,
    releasable:
      fraction < REFUND_COMPLETION_LIMIT &&
      secondsWatched < REFUND_WATCH_LIMIT_SECONDS,
  };
}

/** Every Team Purchase of this Buyer, shaped for the prototype variants. */
export function getPrototypeTeam(
  buyerId: number,
  opts: { pretendRefundable: boolean }
): ProtoPurchase[] {
  const buyerPurchases = db
    .select()
    .from(purchases)
    .where(eq(purchases.userId, buyerId))
    .all();

  let inviteeIndex = 0;
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString();

  return buyerPurchases
    .map((purchase) => {
      const purchaseSeats = db
        .select()
        .from(seats)
        .where(eq(seats.purchaseId, purchase.id))
        .all();
      if (purchaseSeats.length === 0) return null;

      const course = db
        .select()
        .from(courses)
        .where(eq(courses.id, purchase.courseId))
        .get();
      const lessonIds = lessonIdsFor(purchase.courseId);
      let refundStatus = getRefundRequestStatus(purchase.id);
      if (opts.pretendRefundable && !purchaseSeats.some((s) => s.claimedByUserId)) {
        refundStatus = null;
      }
      const refunded = refundStatus === RefundRequestStatus.Approved;

      let mockedInvite = false;
      const protoSeats: ProtoSeat[] = purchaseSeats.map((seat) => {
        if (refunded) return { id: seat.id, code: seat.code, state: "refunded" };
        if (seat.claimedByUserId) {
          const user = db
            .select()
            .from(users)
            .where(eq(users.id, seat.claimedByUserId))
            .get();
          return {
            id: seat.id,
            code: seat.code,
            state: "claimed",
            claimedAt: seat.claimedAt,
            holder: {
              name: user?.name ?? "Unknown",
              email: user?.email ?? "",
              ...holderProgress(seat.claimedByUserId, purchase.courseId, lessonIds),
            },
          };
        }
        if (!mockedInvite) {
          mockedInvite = true;
          return {
            id: seat.id,
            code: seat.code,
            state: "invited",
            invitee: {
              email: MOCK_INVITEES[inviteeIndex++ % MOCK_INVITEES.length],
              sentAt: daysAgo(3),
            },
          };
        }
        return { id: seat.id, code: seat.code, state: "open" };
      });

      return {
        id: purchase.id,
        courseTitle: course?.title ?? "Unknown course",
        courseSlug: course?.slug ?? "",
        purchasedAt: purchase.createdAt,
        amount: purchase.amountPaid,
        refundStatus,
        everClaimed: protoSeats.some((s) => s.state === "claimed"),
        seats: protoSeats,
      } satisfies ProtoPurchase;
    })
    .filter((p): p is ProtoPurchase => p !== null)
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}

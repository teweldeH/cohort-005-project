import { and, eq, inArray, max } from "drizzle-orm";
import { db } from "~/db";
import {
  lessonProgress,
  quizAttempts,
  quizzes,
  videoWatchEvents,
} from "~/db/schema";
import {
  getCompletedLessonCount,
  getLessonIdsForCourse,
} from "~/lib/refunds.server";

/**
 * The summary of a holder's Progress a Buyer may see: % of lessons completed,
 * whether they've finished, and when they were last active (null: never).
 * Nothing finer — no quiz scores, watch time or per-lesson detail.
 */
export interface SeatProgress {
  percent: number;
  finished: boolean;
  lastActive: string | null;
}

/**
 * The latest of a Student's lesson completions, video watches and quiz
 * attempts in the given lessons. ISO dates compare as strings.
 */
function getLastActive(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return null;

  const lastCompletion = db
    .select({ at: max(lessonProgress.completedAt) })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  const lastWatch = db
    .select({ at: max(videoWatchEvents.createdAt) })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .get();

  const lastQuizAttempt = db
    .select({ at: max(quizAttempts.attemptedAt) })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(
      and(
        eq(quizAttempts.userId, userId),
        inArray(quizzes.lessonId, lessonIds)
      )
    )
    .get();

  const times = [lastCompletion?.at, lastWatch?.at, lastQuizAttempt?.at]
    .filter((at): at is string => typeof at === "string")
    .sort();

  return times.at(-1) ?? null;
}

/** A Seat holder's Progress on the Seat's course. */
export function getSeatProgress(
  userId: number,
  courseId: number
): SeatProgress {
  const lessonIds = getLessonIdsForCourse(courseId);
  const completed = getCompletedLessonCount(userId, lessonIds);
  const finished = lessonIds.length > 0 && completed >= lessonIds.length;
  const percent =
    lessonIds.length === 0
      ? 0
      : Math.round((completed / lessonIds.length) * 100);

  return {
    percent,
    finished,
    lastActive: getLastActive(userId, lessonIds),
  };
}

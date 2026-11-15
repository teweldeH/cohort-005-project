import * as schema from "~/db/schema";
import type { createTestDb, seedBaseData } from "~/test/setup";

type TestDb = ReturnType<typeof createTestDb>;
type BaseData = ReturnType<typeof seedBaseData>;

/**
 * Builders for a Student's Progress in the Seat management tests: lessons on
 * a course, and the lesson completions, video watches and quiz attempts that
 * count as being active.
 */
export function progressFixtures(db: TestDb, base: BaseData) {
  /** `count` lessons in one module of the course. */
  function addLessons(count: number, courseId = base.course.id) {
    const module = db
      .insert(schema.modules)
      .values({ courseId, title: "Module", position: 1 })
      .returning()
      .get();

    return db
      .insert(schema.lessons)
      .values(
        Array.from({ length: count }, (_, i) => ({
          moduleId: module.id,
          title: `Lesson ${i + 1}`,
          position: i + 1,
        }))
      )
      .returning()
      .all();
  }

  function completeLesson(userId: number, lessonId: number, at: string) {
    db.insert(schema.lessonProgress)
      .values({
        userId,
        lessonId,
        status: schema.LessonProgressStatus.Completed,
        completedAt: at,
      })
      .run();
  }

  function watchVideo(
    userId: number,
    lessonId: number,
    at: string,
    positionSeconds = 60
  ) {
    db.insert(schema.videoWatchEvents)
      .values({
        userId,
        lessonId,
        eventType: "progress",
        positionSeconds,
        createdAt: at,
      })
      .run();
  }

  function attemptQuiz(userId: number, lessonId: number, at: string) {
    const quiz = db
      .insert(schema.quizzes)
      .values({ lessonId, title: "Quiz", passingScore: 0.7 })
      .returning()
      .get();

    db.insert(schema.quizAttempts)
      .values({ userId, quizId: quiz.id, score: 1, passed: true, attemptedAt: at })
      .run();
  }

  return { addLessons, completeLesson, watchVideo, attemptQuiz };
}

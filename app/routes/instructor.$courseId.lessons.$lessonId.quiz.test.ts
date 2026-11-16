import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { requestAs, thrown } from "~/test/routes";
import { seedBaseData, type TestDb } from "~/test/setup";

// The route reads the app database; point it at an in-memory one.
vi.mock("~/db", async () => {
  const { createTestDb } = await import("~/test/setup");
  return { db: createTestDb() };
});

const { db } = (await import("~/db")) as unknown as { db: TestDb };
const { action } =
  await import("./instructor.$courseId.lessons.$lessonId.quiz");

const base = seedBaseData(db);
const mod = db
  .insert(schema.modules)
  .values({ courseId: base.course.id, title: "Module", position: 1 })
  .returning()
  .get();
const lesson = db
  .insert(schema.lessons)
  .values({ moduleId: mod.id, title: "Lesson", position: 1 })
  .returning()
  .get();

const params = {
  courseId: String(base.course.id),
  lessonId: String(lesson.id),
};

function callAction(request: Request, routeParams = params) {
  return action({
    request,
    params: routeParams,
    context: {},
  } as Parameters<typeof action>[0]);
}

const wizardData = JSON.stringify({
  title: "Lesson quiz",
  passingScore: 70,
  questions: [
    {
      id: "q1",
      text: "Is this a question?",
      type: schema.QuestionType.TrueFalse,
      options: [
        { id: "o1", text: "True", isCorrect: true },
        { id: "o2", text: "False", isCorrect: false },
      ],
    },
  ],
});

function quizOnLesson() {
  return db
    .select()
    .from(schema.quizzes)
    .where(eq(schema.quizzes.lessonId, lesson.id))
    .get();
}

describe("quiz editor action", () => {
  it("returns 404 for a course that doesn't exist", async () => {
    const request = await requestAs(base.instructor.id, {
      form: { intent: "delete-quiz" },
    });

    const result = await thrown(
      callAction(request, { courseId: "9999", lessonId: String(lesson.id) })
    );

    expect(result.status).toBe(404);
  });

  it("returns 404 when deleting a quiz the lesson doesn't have", async () => {
    const request = await requestAs(base.instructor.id, {
      form: { intent: "delete-quiz" },
    });

    const result = await thrown(callAction(request));

    expect(result.status).toBe(404);
  });

  it("creates a quiz when saving one for a lesson without a quiz", async () => {
    const request = await requestAs(base.instructor.id, {
      form: { intent: "save-quiz", wizardData },
    });

    await callAction(request);

    expect(quizOnLesson()?.title).toBe("Lesson quiz");
  });

  it("deletes the lesson's quiz", async () => {
    await callAction(
      await requestAs(base.instructor.id, {
        form: { intent: "save-quiz", wizardData },
      })
    );
    const request = await requestAs(base.instructor.id, {
      form: { intent: "delete-quiz" },
    });

    await callAction(request);

    expect(quizOnLesson()).toBeUndefined();
  });
});

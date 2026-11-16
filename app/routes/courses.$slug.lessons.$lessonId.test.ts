import { describe, it, expect, vi } from "vitest";
import * as schema from "~/db/schema";
import { setCurrentUserId, setDevCountry } from "~/lib/session";
import { markdown } from "~/lib/text";
import { seedBaseData, type TestDb } from "~/test/setup";

// The route reads the app database; point it at an in-memory one.
vi.mock("~/db", async () => {
  const { createTestDb } = await import("~/test/setup");
  return { db: createTestDb() };
});

const { db } = (await import("~/db")) as unknown as { db: TestDb };
const { loader, action } = await import("./courses.$slug.lessons.$lessonId");

// What only someone who may take the course should ever receive.
const VIDEO_URL = "https://www.youtube.com/watch?v=secret-video";
const BODY = "Secret lesson body";
const QUIZ_TITLE = "Secret quiz";
const QUESTION = "Secret question?";

const base = seedBaseData(db);
const course = db
  .update(schema.courses)
  .set({ price: 5000, pppEnabled: true })
  .returning()
  .get();
const mod = db
  .insert(schema.modules)
  .values({ courseId: course.id, title: "Module 1", position: 1 })
  .returning()
  .get();
const lesson = db
  .insert(schema.lessons)
  .values({
    moduleId: mod.id,
    title: "Lesson 1",
    position: 1,
    videoUrl: VIDEO_URL,
    content: markdown(BODY),
  })
  .returning()
  .get();
const quiz = db
  .insert(schema.quizzes)
  .values({ lessonId: lesson.id, title: QUIZ_TITLE, passingScore: 0.5 })
  .returning()
  .get();
const question = db
  .insert(schema.quizQuestions)
  .values({
    quizId: quiz.id,
    questionText: QUESTION,
    questionType: schema.QuestionType.MultipleChoice,
    position: 1,
  })
  .returning()
  .get();
db.insert(schema.quizOptions)
  .values({ questionId: question.id, optionText: "Yes", isCorrect: true })
  .run();

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

const enrolledStudent = addStudent("enrolled");
db.insert(schema.enrollments)
  .values({ userId: enrolledStudent.id, courseId: course.id })
  .run();

// Bought at a discount in India.
const discountBuyer = addStudent("discount-buyer");
db.insert(schema.purchases)
  .values({
    userId: discountBuyer.id,
    courseId: course.id,
    amountPaid: 1000,
    country: "IN",
  })
  .run();
db.insert(schema.enrollments)
  .values({ userId: discountBuyer.id, courseId: course.id })
  .run();

async function requestAs(userId: number | null, devCountry?: string) {
  let cookie = "";
  const withCookie = () =>
    new Request("http://localhost/", {
      headers: cookie ? { Cookie: cookie } : {},
    });
  if (userId !== null) {
    cookie = (await setCurrentUserId(withCookie(), userId)).split(";")[0];
  }
  if (devCountry) {
    cookie = (await setDevCountry(withCookie(), devCountry)).split(";")[0];
  }
  return withCookie();
}

async function loadAs(userId: number | null, devCountry?: string) {
  return loader({
    request: await requestAs(userId, devCountry),
    params: { slug: course.slug, lessonId: String(lesson.id) },
    context: {},
  } as Parameters<typeof loader>[0]);
}

async function actAs(
  userId: number,
  fields: Record<string, string>,
  devCountry?: string
) {
  const request = await requestAs(userId, devCountry);
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return action({
    request: new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body,
    }),
    params: { slug: course.slug, lessonId: String(lesson.id) },
    context: {},
  } as Parameters<typeof action>[0]);
}

/** The status and message of a thrown `data()` response, or null. */
async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    const thrown = error as { init?: { status?: number }; data?: unknown };
    return { status: thrown.init?.status, message: thrown.data };
  }
}

/** Whether any of the lesson's content appears anywhere in the response. */
function carriesContent(response: unknown) {
  const json = JSON.stringify(response);
  return [VIDEO_URL, BODY, QUIZ_TITLE, QUESTION].some((secret) =>
    json.includes(secret)
  );
}

describe("lesson loader", () => {
  it("sends a signed-out visitor no video, body or quiz", async () => {
    const response = await loadAs(null);

    expect(carriesContent(response)).toBe(false);
    expect(response.lesson.title).toBe("Lesson 1");
  });

  it("sends a Student without an Enrollment no video, body or quiz", async () => {
    const response = await loadAs(addStudent("browser").id);

    expect(carriesContent(response)).toBe(false);
    expect(response.lesson.title).toBe("Lesson 1");
  });

  it("sends a Student outside the purchase country no content, but both countries", async () => {
    const response = await loadAs(discountBuyer.id, "US");

    expect(carriesContent(response)).toBe(false);
    expect(response.outsidePurchaseCountry).toEqual(
      expect.objectContaining({ purchaseCountry: "IN", currentCountry: "US" })
    );
  });

  it("sends a Student with an Enrollment the full lesson", async () => {
    const response = await loadAs(enrolledStudent.id);

    expect(response.lesson.videoUrl).toBe(VIDEO_URL);
    expect(response.contentHtml).toContain(BODY);
    expect(response.quiz?.title).toBe(QUIZ_TITLE);
  });

  it("sends the Course Manager the full lesson without an Enrollment", async () => {
    const response = await loadAs(base.instructor.id);

    expect(response.lesson.videoUrl).toBe(VIDEO_URL);
    expect(response.contentHtml).toContain(BODY);
    expect(response.quiz?.title).toBe(QUIZ_TITLE);
  });
});

describe("marking a lesson complete", () => {
  it("is refused for a Student outside the purchase country, and records nothing", async () => {
    const student = addStudent("away-marker");
    db.insert(schema.purchases)
      .values({
        userId: student.id,
        courseId: course.id,
        amountPaid: 1000,
        country: "IN",
      })
      .run();
    db.insert(schema.enrollments)
      .values({ userId: student.id, courseId: course.id })
      .run();

    const refused = await refusal(
      actAs(student.id, { intent: "mark-complete" }, "US")
    );

    expect(refused?.status).toBe(403);
    const back = await loadAs(student.id, "IN");
    expect(back.lessonStatus).not.toBe("completed");
  });

  it("is refused for a Student without an Enrollment", async () => {
    const refused = await refusal(
      actAs(addStudent("unenrolled-marker").id, { intent: "mark-complete" })
    );

    expect(refused?.status).toBe(403);
  });

  it("is allowed for a Student with an Enrollment", async () => {
    const student = addStudent("marker");
    db.insert(schema.enrollments)
      .values({ userId: student.id, courseId: course.id })
      .run();

    await actAs(student.id, { intent: "mark-complete" });

    expect((await loadAs(student.id)).lessonStatus).toBe("completed");
  });

  it("is allowed for the Course Manager", async () => {
    expect(
      await refusal(actAs(base.instructor.id, { intent: "mark-complete" }))
    ).toBeNull();
  });
});

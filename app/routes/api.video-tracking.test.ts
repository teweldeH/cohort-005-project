import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { setCurrentUserId, setDevCountry } from "~/lib/session";
import { seedBaseData, type TestDb } from "~/test/setup";

// The route writes to the app database; point it at an in-memory one.
vi.mock("~/db", async () => {
  const { createTestDb } = await import("~/test/setup");
  return { db: createTestDb() };
});

const { db } = (await import("~/db")) as unknown as { db: TestDb };
const { action } = await import("./api.video-tracking");

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
  .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
  .returning()
  .get();

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

function enrol(userId: number) {
  db.insert(schema.enrollments).values({ userId, courseId: course.id }).run();
}

async function track(
  userId: number | null,
  devCountry?: string,
  lessonId = lesson.id
) {
  let cookie = "";
  const headers = (): Record<string, string> =>
    cookie ? { Cookie: cookie } : {};
  const blank = () => new Request("http://localhost/", { headers: headers() });
  if (userId !== null) {
    cookie = (await setCurrentUserId(blank(), userId)).split(";")[0];
  }
  if (devCountry) {
    cookie = (await setDevCountry(blank(), devCountry)).split(";")[0];
  }
  return action({
    request: new Request("http://localhost/api/video-tracking", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        lessonId,
        eventType: "progress",
        positionSeconds: 30,
      }),
    }),
    params: {},
    context: {},
  } as Parameters<typeof action>[0]);
}

/** The status of a thrown `data()` response, or null if nothing was thrown. */
async function refusedStatus(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    return (error as { init?: { status?: number } }).init?.status;
  }
}

/** How many video-tracking events are stored for the user. */
function eventsStoredFor(userId: number) {
  return db
    .select()
    .from(schema.videoWatchEvents)
    .where(eq(schema.videoWatchEvents.userId, userId))
    .all().length;
}

describe("video tracking", () => {
  it("refuses a signed-out visitor", async () => {
    expect(await refusedStatus(track(null))).toBe(401);
  });

  it("refuses, and doesn't store, events from a Student without an Enrollment", async () => {
    const student = addStudent("browser");

    expect(await refusedStatus(track(student.id))).toBe(403);
    expect(eventsStoredFor(student.id)).toBe(0);
  });

  it("refuses, and doesn't store, events from a Student outside the purchase country", async () => {
    const student = addStudent("traveller");
    db.insert(schema.purchases)
      .values({
        userId: student.id,
        courseId: course.id,
        amountPaid: 1000,
        country: "IN",
      })
      .run();
    enrol(student.id);

    expect(await refusedStatus(track(student.id, "US"))).toBe(403);
    expect(eventsStoredFor(student.id)).toBe(0);
  });

  it("is not found for a lesson that doesn't exist", async () => {
    const student = addStudent("lost");
    enrol(student.id);

    expect(await refusedStatus(track(student.id, undefined, 99999))).toBe(404);
    expect(eventsStoredFor(student.id)).toBe(0);
  });

  it("stores events from a Student with an Enrollment", async () => {
    const student = addStudent("watcher");
    enrol(student.id);

    expect(await refusedStatus(track(student.id))).toBeNull();
    expect(eventsStoredFor(student.id)).toBe(1);
  });

  it("stores events from the Course Manager", async () => {
    expect(await refusedStatus(track(base.instructor.id))).toBeNull();
    expect(eventsStoredFor(base.instructor.id)).toBe(1);
  });
});

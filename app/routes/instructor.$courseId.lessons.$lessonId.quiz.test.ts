import { describe, it, expect, vi } from "vitest";
import { setCurrentUserId } from "~/lib/session";
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

async function postAs(userId: number) {
  const cookie = (
    await setCurrentUserId(new Request("http://localhost/"), userId)
  ).split(";")[0];
  return new Request("http://localhost/", {
    method: "POST",
    headers: { Cookie: cookie },
    body: new FormData(),
  });
}

async function statusOf(call: Promise<unknown>) {
  try {
    await call;
    return null;
  } catch (error) {
    return (error as { init: { status: number } }).init.status;
  }
}

describe("quiz editor action", () => {
  it("returns 404 for a course that doesn't exist", async () => {
    const request = await postAs(base.instructor.id);

    const status = await statusOf(
      action({
        request,
        params: { courseId: "9999", lessonId: "1" },
        context: {},
      } as Parameters<typeof action>[0])
    );

    expect(status).toBe(404);
  });
});

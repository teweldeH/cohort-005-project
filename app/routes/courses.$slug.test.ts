import { describe, it, expect, vi } from "vitest";
import { seedBaseData, type TestDb } from "~/test/setup";
import { requestAs, seedDiscountedCourse, thrown } from "~/test/routes";

// The route reads the app database; point it at an in-memory one.
vi.mock("~/db", async () => {
  const { createTestDb } = await import("~/test/setup");
  return { db: createTestDb() };
});

const { db } = (await import("~/db")) as unknown as { db: TestDb };
const { action } = await import("./courses.$slug");

const base = seedBaseData(db);
const { course, buyer, stranger, admin } = seedDiscountedCourse(
  db,
  base.instructor.id
);

type ActionArgs = Parameters<typeof action>[0];

async function rate(userId: number | null, options: { country?: string } = {}) {
  const request = await requestAs(userId, {
    ...options,
    form: { rating: "4" },
  });
  return action({
    request,
    params: { slug: course.slug },
    context: {},
  } as ActionArgs);
}

describe("rating a course", () => {
  it("lets a Student with an Enrollment rate it", async () => {
    expect(await rate(buyer.id, { country: "IN" })).toMatchObject({ ok: true });
  });

  it("refuses a Student outside the country of their discounted Purchase", async () => {
    expect(await thrown(rate(buyer.id, { country: "US" }))).toMatchObject({
      status: 403,
    });
  });

  it("refuses a Student without an Enrollment", async () => {
    expect(await thrown(rate(stranger.id))).toMatchObject({ status: 403 });
  });

  it("refuses a signed-out visitor", async () => {
    expect(await thrown(rate(null))).toMatchObject({ status: 401 });
  });

  it("lets the owning Instructor rate it without an Enrollment", async () => {
    expect(await rate(base.instructor.id)).toMatchObject({ ok: true });
  });

  it("lets a Platform Admin rate it without an Enrollment", async () => {
    expect(await rate(admin.id)).toMatchObject({ ok: true });
  });
});

import { describe, it, expect, vi } from "vitest";
import { seedBaseData, type TestDb } from "~/test/setup";
import { requestAs, seedDiscountedCourse, thrown } from "~/test/routes";

// The route reads the app database; point it at an in-memory one.
vi.mock("~/db", async () => {
  const { createTestDb } = await import("~/test/setup");
  return { db: createTestDb() };
});

const { db } = (await import("~/db")) as unknown as { db: TestDb };
const { loader } = await import("./courses.$slug.welcome");

const base = seedBaseData(db);
const { course, buyer, stranger, admin } = seedDiscountedCourse(
  db,
  base.instructor.id
);

type LoaderArgs = Parameters<typeof loader>[0];

async function openWelcome(
  userId: number | null,
  options: { country?: string } = {}
) {
  return loader({
    request: await requestAs(userId, options),
    params: { slug: course.slug },
    context: {},
  } as LoaderArgs);
}

const backToCourse = { status: 302, location: `/courses/${course.slug}` };

describe("welcome page", () => {
  it("welcomes a Student with an Enrollment", async () => {
    const page = await openWelcome(buyer.id, { country: "IN" });
    expect(page.course.id).toBe(course.id);
  });

  it("sends a Student outside the country of their discounted Purchase back to the course", async () => {
    expect(await thrown(openWelcome(buyer.id, { country: "US" }))).toEqual(
      backToCourse
    );
  });

  it("sends a Student without an Enrollment back to the course", async () => {
    expect(await thrown(openWelcome(stranger.id))).toEqual(backToCourse);
  });

  it("sends a signed-out visitor back to the course", async () => {
    expect(await thrown(openWelcome(null))).toEqual(backToCourse);
  });

  it("opens for the owning Instructor", async () => {
    const page = await openWelcome(base.instructor.id);
    expect(page.course.id).toBe(course.id);
  });

  it("opens for a Platform Admin", async () => {
    const page = await openWelcome(admin.id);
    expect(page.course.id).toBe(course.id);
  });
});

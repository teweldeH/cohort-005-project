import { describe, it, expect, vi } from "vitest";
import * as schema from "~/db/schema";
import { seedBaseData, type TestDb } from "~/test/setup";
import { requestAs, seedDiscountedCourse } from "~/test/routes";

// The route reads the app database; point it at an in-memory one.
vi.mock("~/db", async () => {
  const { createTestDb } = await import("~/test/setup");
  return { db: createTestDb() };
});

const { db } = (await import("~/db")) as unknown as { db: TestDb };
const { loader } = await import("./courses.$slug.$moduleId");

const base = seedBaseData(db);
const { course, buyer, stranger, admin } = seedDiscountedCourse(
  db,
  base.instructor.id
);
const mod = db
  .insert(schema.modules)
  .values({ courseId: course.id, title: "Module 1", position: 1 })
  .returning()
  .get();

type LoaderArgs = Parameters<typeof loader>[0];

async function openModule(
  userId: number | null,
  options: { country?: string } = {}
) {
  return loader({
    request: await requestAs(userId, options),
    params: { slug: course.slug, moduleId: String(mod.id) },
    context: {},
  } as LoaderArgs);
}

describe("module page", () => {
  it("shows a Student with an Enrollment the module as theirs", async () => {
    const page = await openModule(buyer.id, { country: "IN" });
    expect(page.canTakeCourse).toBe(true);
    expect(page.outsidePurchaseCountry).toBeNull();
  });

  it("locks the module for a Student outside the country of their discounted Purchase", async () => {
    const page = await openModule(buyer.id, { country: "US" });
    expect(page.canTakeCourse).toBe(false);
    expect(page.outsidePurchaseCountry).toEqual({
      purchaseCountry: "IN",
      currentCountry: "US",
    });
  });

  it("locks the module for a Student without an Enrollment", async () => {
    const page = await openModule(stranger.id);
    expect(page.canTakeCourse).toBe(false);
    expect(page.outsidePurchaseCountry).toBeNull();
  });

  it("locks the module for a signed-out visitor", async () => {
    expect((await openModule(null)).canTakeCourse).toBe(false);
  });

  it("lets the owning Instructor take the course without an Enrollment", async () => {
    expect((await openModule(base.instructor.id)).canTakeCourse).toBe(true);
  });

  it("lets a Platform Admin take the course without an Enrollment", async () => {
    expect((await openModule(admin.id)).canTakeCourse).toBe(true);
  });
});

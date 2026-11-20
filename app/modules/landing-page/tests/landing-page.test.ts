import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { enrollStudentInTransaction } from "~/lib/enrollments.server";
import { markdown } from "~/lib/text";
import { createLandingPage } from "../index.server";

const NOW = new Date("2026-11-20T12:00:00.000Z");

let db: TestDb;
let instructorId: number;
let categoryId: number;
let baseCourseId: number;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  instructorId = base.instructor.id;
  categoryId = base.category.id;
  baseCourseId = base.course.id;
});

// ─── Fixtures ───
// Courses, students and lessons have no service that writes them, so those
// rows go in directly. Enrollments go through the enrollment service.

let counter = 0;

function addCourse(
  title: string,
  { createdAt = NOW.toISOString(), status = CourseStatus.Published } = {}
) {
  counter += 1;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `course-${counter}`,
      description: `${title} description`,
      salesCopy: markdown(title),
      instructorId,
      categoryId,
      status,
      createdAt,
    })
    .returning()
    .get();
}

function enrollStudents(courseId: number, howMany: number) {
  for (let i = 0; i < howMany; i++) {
    counter += 1;
    const student = db
      .insert(schema.users)
      .values({
        name: `Student ${counter}`,
        email: `student${counter}@example.com`,
        role: UserRole.Student,
      })
      .returning()
      .get();
    enrollStudentInTransaction(db, student.id, courseId, NOW);
  }
}

function addLessons(courseId: number, howMany: number) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  for (let position = 1; position <= howMany; position++) {
    db.insert(schema.lessons)
      .values({ moduleId: mod.id, title: `Lesson ${position}`, position })
      .run();
  }
}

async function featuredTitles() {
  const { featuredCourses } = await createLandingPage(db).get();
  return featuredCourses.map((c) => c.title);
}

describe("landing page featured courses", () => {
  it("ranks published courses by enrollment count, most first", async () => {
    const popular = addCourse("Popular", { createdAt: "2026-01-01T00:00:00Z" });
    const middling = addCourse("Middling");
    addCourse("Unloved", { createdAt: "2026-11-19T00:00:00Z" });
    enrollStudents(popular.id, 3);
    enrollStudents(middling.id, 2);
    enrollStudents(baseCourseId, 1);

    expect(await featuredTitles()).toEqual([
      "Popular",
      "Middling",
      "Test Course",
    ]);
  });

  it("gives a tie to the newer course", async () => {
    const tied = [
      addCourse("Oldest", { createdAt: "2025-01-01T00:00:00Z" }),
      addCourse("Older", { createdAt: "2026-01-01T00:00:00Z" }),
      addCourse("Newer", { createdAt: "2026-06-01T00:00:00Z" }),
    ];
    for (const course of tied) enrollStudents(course.id, 1);

    expect(await featuredTitles()).toEqual(["Newer", "Older", "Oldest"]);
  });

  it("gives a tie on creation time to the later-added course", async () => {
    const sameMoment = { createdAt: "2026-01-01T00:00:00Z" };
    const first = addCourse("First", sameMoment);
    const second = addCourse("Second", sameMoment);
    for (const course of [first, second]) enrollStudents(course.id, 1);

    expect((await featuredTitles()).slice(0, 2)).toEqual(["Second", "First"]);
  });

  it("leaves out unpublished courses however popular they are", async () => {
    const draft = addCourse("Draft", { status: CourseStatus.Draft });
    const archived = addCourse("Archived", { status: CourseStatus.Archived });
    enrollStudents(draft.id, 5);
    enrollStudents(archived.id, 5);

    expect(await featuredTitles()).toEqual(["Test Course"]);
  });

  it("shows at most three courses", async () => {
    for (const title of ["A", "B", "C", "D"]) addCourse(title);

    expect(await featuredTitles()).toHaveLength(3);
  });

  it("reports each course's enrollments, lessons, instructor and category", async () => {
    const course = addCourse("Counted");
    enrollStudents(course.id, 2);
    addLessons(course.id, 4);

    const [featured, base] = (await createLandingPage(db).get())
      .featuredCourses;

    expect(featured).toMatchObject({
      id: course.id,
      title: "Counted",
      slug: course.slug,
      description: "Counted description",
      enrollmentCount: 2,
      lessonCount: 4,
      instructorName: "Test Instructor",
      categoryName: "Programming",
    });
    expect(base).toMatchObject({ enrollmentCount: 0, lessonCount: 0 });
  });
});

describe("landing page totals", () => {
  it("counts published courses, categories and their enrollments", async () => {
    const draft = addCourse("Draft", { status: CourseStatus.Draft });
    const other = addCourse("Other");
    enrollStudents(draft.id, 4);
    enrollStudents(other.id, 2);
    enrollStudents(baseCourseId, 1);
    db.insert(schema.categories)
      .values({ name: "Design", slug: "design" })
      .run();

    expect(await createLandingPage(db).get()).toMatchObject({
      totalCourses: 2,
      totalCategories: 2,
      totalEnrollments: 3,
    });
  });

  it("is all zeros on an empty database", async () => {
    const empty = await createLandingPage(createTestDb()).get();

    expect(empty).toEqual({
      featuredCourses: [],
      totalCourses: 0,
      totalCategories: 0,
      totalEnrollments: 0,
    });
  });
});

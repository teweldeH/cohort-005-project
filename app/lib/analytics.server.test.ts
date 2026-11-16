import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, LessonProgressStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { getCourseAnalytics } from "./analytics.server";

const NOW = new Date("2026-10-20T12:00:00.000Z");

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

function addInstructorWithCourse(name: string, title: string) {
  const instructor = addUser(name, UserRole.Instructor);
  return { instructor, course: addCourse(title, instructor.id) };
}

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function addUser(name: string, role = UserRole.Student) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/ /g, ".")}@example.com`,
      role,
    })
    .returning()
    .get();
}

function addCourse(title: string, instructorId: number) {
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: title.toLowerCase().replace(/ /g, "-"),
      description: title,
      salesCopy: markdown(title),
      instructorId,
      categoryId: base.category.id,
      status: CourseStatus.Published,
    })
    .returning()
    .get();
}

function addModule(courseId: number, title: string, position: number) {
  return db
    .insert(schema.modules)
    .values({ courseId, title, position })
    .returning()
    .get();
}

function addLesson(moduleId: number, title: string, position: number) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get();
}

function enrol(userId: number, courseId: number, days = 1) {
  db.insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt: daysAgo(days) })
    .run();
}

function track(userId: number, lessonId: number, status: LessonProgressStatus) {
  db.insert(schema.lessonProgress).values({ userId, lessonId, status }).run();
}

function buy(
  userId: number,
  courseId: number,
  amountPaid: number,
  { days = 1, country = "US" as string | null } = {}
) {
  return db
    .insert(schema.purchases)
    .values({ userId, courseId, amountPaid, country, createdAt: daysAgo(days) })
    .returning()
    .get();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("getCourseAnalytics", () => {
  it("selects no course when an instructor asks for someone else's", () => {
    const other = addInstructorWithCourse("Other Instructor", "Their Course");

    const analytics = getCourseAnalytics(
      db,
      { instructorId: base.instructor.id, range: "all", now: NOW },
      other.course.id
    );

    expect(analytics.selectedCourseId).toBeNull();
    expect(analytics.progress).toBeNull();
    expect(analytics.funnel).toBeNull();
    expect(analytics.quizzes).toBeNull();
    expect(analytics.countries).toBeNull();
    expect(analytics.courseOptions).toEqual([
      { courseId: base.course.id, title: "Test Course" },
    ]);
  });

  it("lets the platform-wide view select any instructor's course", () => {
    const other = addInstructorWithCourse("Other Instructor", "A Course");

    const analytics = getCourseAnalytics(
      db,
      { instructorId: null, range: "all", now: NOW },
      other.course.id
    );

    expect(analytics.selectedCourseId).toBe(other.course.id);
    expect(analytics.courseOptions.map((course) => course.title)).toEqual([
      "A Course",
      "Test Course",
    ]);
  });

  describe("for a selected course", () => {
    // Two modules, inserted out of order so position, not id, decides the
    // curriculum: Module One holds lessons one and two, Module Two lesson three.
    let lessonOne: { id: number };
    let lessonTwo: { id: number };
    let lessonThree: { id: number };
    let moduleOne: { id: number };
    let moduleTwo: { id: number };
    let finisher: { id: number };
    let starter: { id: number };
    let opener: { id: number };

    beforeEach(() => {
      moduleTwo = addModule(base.course.id, "Module Two", 2);
      moduleOne = addModule(base.course.id, "Module One", 1);
      lessonTwo = addLesson(moduleOne.id, "Lesson Two", 2);
      lessonOne = addLesson(moduleOne.id, "Lesson One", 1);
      lessonThree = addLesson(moduleTwo.id, "Lesson Three", 1);

      finisher = addUser("Finisher");
      starter = addUser("Starter");
      opener = addUser("Opener");
      const outsider = addUser("Outsider");

      for (const student of [finisher, starter, opener]) {
        enrol(student.id, base.course.id);
      }

      for (const lesson of [lessonOne, lessonTwo, lessonThree]) {
        track(finisher.id, lesson.id, LessonProgressStatus.Completed);
      }
      track(starter.id, lessonOne.id, LessonProgressStatus.Completed);
      track(opener.id, lessonOne.id, LessonProgressStatus.InProgress);
      // Working through a course they never enrolled in counts for nothing,
      // even for someone enrolled elsewhere.
      enrol(outsider.id, addCourse("Elsewhere", base.instructor.id).id);
      track(outsider.id, lessonThree.id, LessonProgressStatus.Completed);
    });

    function analyse(range: "all" | "30d" = "all") {
      return getCourseAnalytics(
        db,
        { instructorId: base.instructor.id, range, now: NOW },
        base.course.id
      );
    }

    it("averages completion across every enrollee, including non-starters", () => {
      // 3/3, 1/3 and 0/3 lessons completed: (100 + 33.3 + 0) / 3.
      expect(analyse().progress).toEqual({
        enrolledCount: 3,
        totalLessons: 3,
        averageProgressPercent: 44,
        finishedCount: 1,
      });
    });

    it("builds the drop-off funnel from each student's furthest lesson", () => {
      // Everyone opened lesson one (in progress counts as reached); only the
      // finisher got past it.
      expect(analyse().funnel).toEqual({
        enrolledCount: 3,
        modules: [
          {
            moduleId: moduleOne.id,
            title: "Module One",
            reachedCount: 3,
            dropWithin: 2,
            lessons: [
              {
                lessonId: lessonOne.id,
                title: "Lesson One",
                reachedCount: 3,
                dropFromPrevious: 0,
              },
              {
                lessonId: lessonTwo.id,
                title: "Lesson Two",
                reachedCount: 1,
                dropFromPrevious: 2,
              },
            ],
          },
          {
            moduleId: moduleTwo.id,
            title: "Module Two",
            reachedCount: 1,
            dropWithin: 0,
            lessons: [
              {
                lessonId: lessonThree.id,
                title: "Lesson Three",
                reachedCount: 1,
                dropFromPrevious: 0,
              },
            ],
          },
        ],
      });
    });

    describe("quiz pass rates", () => {
      beforeEach(() => {
        const quizA = db
          .insert(schema.quizzes)
          .values({
            lessonId: lessonOne.id,
            title: "Quiz A",
            passingScore: 0.7,
          })
          .returning()
          .get();
        db.insert(schema.quizzes)
          .values({
            lessonId: lessonThree.id,
            title: "Quiz B",
            passingScore: 0.5,
          })
          .run();

        const attempt = (
          userId: number,
          score: number,
          passed: boolean,
          days: number
        ) =>
          db
            .insert(schema.quizAttempts)
            .values({
              userId,
              quizId: quizA.id,
              score,
              passed,
              attemptedAt: daysAgo(days),
            })
            .run();

        attempt(finisher.id, 0.5, false, 2);
        attempt(finisher.id, 0.9, true, 1);
        attempt(starter.id, 0.6, false, 1);
        attempt(opener.id, 0.8, true, 60);
      });

      it("judges each student by their best attempt", () => {
        // Best attempts 0.9 (pass), 0.6 (fail), 0.8 (pass).
        expect(analyse("all").quizzes).toEqual([
          {
            quizId: expect.any(Number),
            title: "Quiz A",
            moduleTitle: "Module One",
            lessonTitle: "Lesson One",
            passingScorePercent: 70,
            studentCount: 3,
            passedCount: 2,
            passRatePercent: 67,
            averageBestScorePercent: 77,
          },
          {
            quizId: expect.any(Number),
            title: "Quiz B",
            moduleTitle: "Module Two",
            lessonTitle: "Lesson Three",
            passingScorePercent: 50,
            studentCount: 0,
            passedCount: 0,
            passRatePercent: null,
            averageBestScorePercent: null,
          },
        ]);
      });

      it("leaves attempts from before the range out", () => {
        expect(analyse("30d").quizzes?.[0]).toMatchObject({
          studentCount: 2,
          passedCount: 1,
          passRatePercent: 50,
          averageBestScorePercent: 75,
        });
      });
    });

    it("breaks revenue down by country, biggest first, with parity discounts", () => {
      buy(finisher.id, base.course.id, 10000, { country: "US" });
      buy(starter.id, base.course.id, 10000, { country: "US" });
      buy(opener.id, base.course.id, 5000, { country: "IN" });
      buy(base.user.id, base.course.id, 3000, { country: null });
      // Outside the range, and on another course: neither counts.
      buy(base.user.id, base.course.id, 7000, { country: "BR", days: 60 });
      const second = addCourse("Second Course", base.instructor.id);
      buy(finisher.id, second.id, 9999, { country: "US" });

      expect(analyse("30d").countries).toEqual({
        grossCents: 28000,
        netCents: 22400,
        purchaseCount: 4,
        discountedGrossCents: 5000,
        discountedNetCents: 4000,
        discountedSharePercent: 18,
        rows: [
          {
            country: "US",
            purchaseCount: 2,
            grossCents: 20000,
            netCents: 16000,
            sharePercent: 71,
            averagePaidCents: 10000,
            discountPercent: 0,
          },
          {
            country: "IN",
            purchaseCount: 1,
            grossCents: 5000,
            netCents: 4000,
            sharePercent: 18,
            averagePaidCents: 5000,
            discountPercent: 50,
          },
          {
            country: null,
            purchaseCount: 1,
            grossCents: 3000,
            netCents: 2400,
            sharePercent: 11,
            averagePaidCents: 3000,
            discountPercent: null,
          },
        ],
      });
    });
  });
});

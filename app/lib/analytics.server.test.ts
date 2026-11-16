import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, LessonProgressStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import {
  getAnalyticsOverview,
  getCourseAnalytics,
  listAnalyticsInstructors,
  type AnalyticsScope,
} from "./analytics.server";

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

function addCourse(
  title: string,
  instructorId: number,
  status = CourseStatus.Published
) {
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: title.toLowerCase().replace(/ /g, "-"),
      description: title,
      salesCopy: markdown(title),
      instructorId,
      categoryId: base.category.id,
      status,
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

describe("getAnalyticsOverview", () => {
  it("counts only the instructor's own sales, or everyone's platform-wide", () => {
    const other = addInstructorWithCourse("Other Instructor", "Their Course");
    buy(base.user.id, base.course.id, 10000);
    buy(base.user.id, other.course.id, 5000);

    const own = getAnalyticsOverview(db, {
      instructorId: base.instructor.id,
      range: "30d",
      now: NOW,
    });
    const platform = getAnalyticsOverview(db, {
      instructorId: null,
      range: "30d",
      now: NOW,
    });

    expect(own.summary).toEqual({
      grossCents: 10000,
      feeCents: 2000,
      netCents: 8000,
      purchaseCount: 1,
    });
    expect(platform.summary).toEqual({
      grossCents: 15000,
      feeCents: 3000,
      netCents: 12000,
      purchaseCount: 2,
    });
  });

  function overview(scope: Partial<AnalyticsScope> = {}) {
    return getAnalyticsOverview(db, {
      instructorId: base.instructor.id,
      range: "30d",
      now: NOW,
      ...scope,
    });
  }

  it("leaves purchases from before the range out of the summary", () => {
    buy(base.user.id, base.course.id, 10000, { days: 1 });
    buy(base.user.id, base.course.id, 4000, { days: 3 });
    buy(base.user.id, base.course.id, 6000, { days: 10 });

    expect(overview({ range: "7d" }).summary).toEqual({
      grossCents: 14000,
      feeCents: 2800,
      netCents: 11200,
      purchaseCount: 2,
    });
    expect(overview({ range: "all" }).summary.grossCents).toBe(20000);
  });

  it("charts every day of a fixed range up to today, sales or not", () => {
    buy(base.user.id, base.course.id, 10000, { days: 1 });
    buy(base.user.id, base.course.id, 4000, { days: 3 });

    const series = overview({ range: "7d" }).series;

    expect(series.granularity).toBe("day");
    expect(series.points).toEqual([
      { bucket: "2026-10-13", grossCents: 0, netCents: 0 },
      { bucket: "2026-10-14", grossCents: 0, netCents: 0 },
      { bucket: "2026-10-15", grossCents: 0, netCents: 0 },
      { bucket: "2026-10-16", grossCents: 0, netCents: 0 },
      { bucket: "2026-10-17", grossCents: 4000, netCents: 3200 },
      { bucket: "2026-10-18", grossCents: 0, netCents: 0 },
      { bucket: "2026-10-19", grossCents: 10000, netCents: 8000 },
      { bucket: "2026-10-20", grossCents: 0, netCents: 0 },
    ]);
  });

  it("charts all time by month from the first sale, and nothing with no sales", () => {
    expect(overview({ range: "all" }).series).toEqual({
      granularity: "month",
      points: [],
    });

    buy(base.user.id, base.course.id, 5000, { days: 70 });
    buy(base.user.id, base.course.id, 1000, { days: 1 });

    expect(overview({ range: "all" }).series.points).toEqual([
      { bucket: "2026-08", grossCents: 5000, netCents: 4000 },
      { bucket: "2026-09", grossCents: 0, netCents: 0 },
      { bucket: "2026-10", grossCents: 1000, netCents: 800 },
    ]);
  });

  it("breaks revenue down by course, biggest earner first", () => {
    const second = addCourse("Second Course", base.instructor.id);
    addCourse("Unsold Course", base.instructor.id);
    buy(base.user.id, base.course.id, 3000);
    buy(base.user.id, second.id, 8000);
    buy(base.user.id, second.id, 2000);

    expect(overview().courses).toEqual([
      {
        courseId: second.id,
        title: "Second Course",
        grossCents: 10000,
        feeCents: 2000,
        netCents: 8000,
        purchaseCount: 2,
      },
      {
        courseId: base.course.id,
        title: "Test Course",
        grossCents: 3000,
        feeCents: 600,
        netCents: 2400,
        purchaseCount: 1,
      },
    ]);
  });

  describe("with a team licence", () => {
    let individual: { id: number };
    let teamAdmin: { id: number };

    beforeEach(() => {
      // One Individual Purchase, and a Team Licence of three Seats of which
      // two are claimed. The Team Admin buys but never enrols.
      individual = addUser("Ivy Individual");
      teamAdmin = addUser("Tess Team");
      const claimers = [addUser("Sam Seat"), addUser("Sid Seat")];

      buy(individual.id, base.course.id, 10000);
      enrol(individual.id, base.course.id);

      const licence = buy(teamAdmin.id, base.course.id, 9000);
      const team = db.insert(schema.teams).values({}).returning().get();
      [...claimers, null].forEach((claimer, index) => {
        db.insert(schema.coupons)
          .values({
            teamId: team.id,
            courseId: base.course.id,
            code: `SEAT-${index}`,
            purchaseId: licence.id,
            redeemedByUserId: claimer?.id ?? null,
            redeemedAt: claimer ? daysAgo(1) : null,
          })
          .run();
        if (claimer) enrol(claimer.id, base.course.id);
      });
    });

    it("counts buyers and students apart, splitting a licence across its seats", () => {
      // Students: 10000, 3000 and 3000 — a third of the licence each.
      expect(overview().audience).toEqual({
        buyerCount: 2,
        studentCount: 3,
        revenuePerStudentCents: 5333,
      });
    });

    it("doesn't credit a Team Admin who enrols with their licence's money", () => {
      // The licence paid for other people's seats, so it stays split across
      // them: 10000, 3000, 3000 and 0 over four students.
      enrol(teamAdmin.id, base.course.id);

      expect(overview().audience).toEqual({
        buyerCount: 2,
        studentCount: 4,
        revenuePerStudentCents: 4000,
      });
    });

    it("ranks top buyers by spend, with their seats and enrolment", () => {
      expect(overview().buyers).toEqual([
        {
          userId: individual.id,
          name: "Ivy Individual",
          email: "ivy.individual@example.com",
          spendCents: 10000,
          purchaseCount: 1,
          seatsBought: 0,
          seatsUnredeemed: 0,
          enrolled: true,
        },
        {
          userId: teamAdmin.id,
          name: "Tess Team",
          email: "tess.team@example.com",
          spendCents: 9000,
          purchaseCount: 1,
          seatsBought: 3,
          seatsUnredeemed: 1,
          enrolled: false,
        },
      ]);
    });
  });

  it("reports no students and no per-student figure with nobody enrolled", () => {
    expect(overview().audience).toEqual({
      buyerCount: 0,
      studentCount: 0,
      revenuePerStudentCents: null,
    });
  });

  it("averages ratings in the range to one decimal place", () => {
    const other = addInstructorWithCourse("Other Instructor", "Their Course");
    const rate = (courseId: number, rating: number, days: number) =>
      db
        .insert(schema.courseRatings)
        .values({
          userId: addUser(`Rater ${courseId}-${rating}-${days}`).id,
          courseId,
          rating,
          createdAt: daysAgo(days),
        })
        .run();

    expect(overview().ratings).toEqual({ average: null, count: 0 });

    rate(base.course.id, 5, 1);
    rate(base.course.id, 4, 1);
    rate(base.course.id, 1, 60);
    rate(other.course.id, 2, 1);

    expect(overview().ratings).toEqual({ average: 4.5, count: 2 });
    expect(overview({ range: "all" }).ratings).toEqual({
      average: 3.3,
      count: 3,
    });
  });

  it("counts unanswered student questions, splitting off ones older than the range", () => {
    const module = addModule(base.course.id, "Module", 1);
    const lesson = addLesson(module.id, "Lesson", 1);
    const admin = addUser("Ada Admin", UserRole.Admin);
    const classmate = addUser("Cal Classmate");

    const comment = (
      userId: number,
      days: number,
      extra: { parentId?: number; deletedAt?: string } = {}
    ) =>
      db
        .insert(schema.comments)
        .values({
          lessonId: lesson.id,
          userId,
          body: markdown("?"),
          createdAt: daysAgo(days),
          ...extra,
        })
        .returning()
        .get();

    // Unanswered: no reply, a staff reply that was deleted, a classmate's reply.
    comment(base.user.id, 1);
    const deletedReply = comment(base.user.id, 1);
    comment(admin.id, 1, { parentId: deletedReply.id, deletedAt: daysAgo(0) });
    const classmateReply = comment(base.user.id, 1);
    comment(classmate.id, 1, { parentId: classmateReply.id });
    // Unanswered, but from before the range.
    comment(base.user.id, 60);

    // Not questions that need answering.
    const answered = comment(base.user.id, 1);
    comment(base.instructor.id, 1, { parentId: answered.id });
    const answeredByAdmin = comment(base.user.id, 1);
    comment(admin.id, 1, { parentId: answeredByAdmin.id });
    comment(base.instructor.id, 1);
    comment(admin.id, 1);
    comment(base.user.id, 1, { deletedAt: daysAgo(0) });

    expect(overview().questions).toEqual({ inRange: 3, older: 1 });
    expect(overview({ range: "all" }).questions).toEqual({
      inRange: 4,
      older: 0,
    });
  });

  it("flags an instructor with nothing published, but never the platform", () => {
    const drafter = addUser("Drew Drafter", UserRole.Instructor);
    addCourse("Draft Course", drafter.id, CourseStatus.Draft);

    expect(overview().unpublished).toBe(false);
    expect(overview({ instructorId: drafter.id }).unpublished).toBe(true);
    expect(overview({ instructorId: null }).unpublished).toBe(false);
  });

  it("reports the refund exposure as of the scope's now", () => {
    buy(base.user.id, base.course.id, 3000, { days: 2 });
    buy(base.user.id, base.course.id, 1000, { days: 20 });

    const exposure = overview().refundExposure;

    expect(exposure.grossCents).toBe(3000);
    expect(exposure.sharePercent).toBe(75);
    expect(exposure.courses).toEqual([
      {
        courseId: base.course.id,
        title: "Test Course",
        grossCents: 3000,
        purchaseCount: 1,
        daysLeft: 12,
      },
    ]);
  });
});

describe("listAnalyticsInstructors", () => {
  it("lists everyone who owns a course, admins included, by name", () => {
    const admin = addUser("Ada Admin", UserRole.Admin);
    addCourse("Admin Course", admin.id);
    addUser("Idle Instructor", UserRole.Instructor);

    expect(listAnalyticsInstructors(db)).toEqual([
      { id: admin.id, name: "Ada Admin" },
      { id: base.instructor.id, name: "Test Instructor" },
    ]);
  });
});

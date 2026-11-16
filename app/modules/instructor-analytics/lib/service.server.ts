import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  ne,
  notExists,
  or,
  sql,
  sum,
} from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { alias, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import {
  CourseStatus,
  LessonProgressStatus,
  UserRole,
  comments,
  courseRatings,
  courses,
  coupons,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  purchases,
  quizAttempts,
  quizzes,
  users,
} from "~/db/schema";
import { db as appDb } from "~/db";
import { rangeStart, splitRevenue, type AnalyticsRange } from "../analytics";
import { getDiscountForCountry } from "~/lib/ppp";
import { computeRefundExposure, type RefundExposure } from "../refund-exposure";

// ─── Instructor Analytics service ───
// The figures behind the instructor analytics page, one entry point per tab.
// Every query helper here is private: callers pass a scope and (for the
// course tab) the course they asked for, and get plain data back. The
// database is the app's unless a caller passes another: tests pass their own.

export type Db = BetterSQLite3Database<typeof schema>;

/** Whose figures, over which range, as of when. Null means platform-wide. */
export type AnalyticsScope = {
  instructorId: number | null;
  range: AnalyticsRange;
  now: Date;
};

export type CourseProgressSummary = {
  enrolledCount: number;
  totalLessons: number;
  averageProgressPercent: number | null;
  finishedCount: number;
};

export type FunnelLesson = {
  lessonId: number;
  title: string;
  reachedCount: number;
  dropFromPrevious: number;
};

export type FunnelModule = {
  moduleId: number;
  title: string;
  reachedCount: number;
  dropWithin: number;
  lessons: FunnelLesson[];
};

export type CourseFunnel = {
  enrolledCount: number;
  modules: FunnelModule[];
};

export type QuizPassRate = {
  quizId: number;
  title: string;
  moduleTitle: string;
  lessonTitle: string;
  passingScorePercent: number;
  studentCount: number;
  passedCount: number;
  passRatePercent: number | null;
  averageBestScorePercent: number | null;
};

export type CountryRevenueRow = {
  country: string | null;
  purchaseCount: number;
  grossCents: number;
  netCents: number;
  sharePercent: number;
  averagePaidCents: number;
  discountPercent: number | null;
};

export type CourseCountryRevenue = {
  grossCents: number;
  netCents: number;
  purchaseCount: number;
  discountedGrossCents: number;
  discountedNetCents: number;
  discountedSharePercent: number;
  rows: CountryRevenueRow[];
};

function sinceRange(dateColumn: SQLiteColumn, scope: AnalyticsScope) {
  const start = rangeStart(scope.range, scope.now);
  return start === null ? undefined : gte(dateColumn, start);
}

function ownedBy(instructorId: number | null) {
  return instructorId === null
    ? undefined
    : eq(courses.instructorId, instructorId);
}

export type RevenueSummary = {
  grossCents: number;
  feeCents: number;
  netCents: number;
  purchaseCount: number;
};

export type RevenuePoint = {
  bucket: string;
  grossCents: number;
  netCents: number;
};

export type RevenueSeries = {
  granularity: "day" | "month";
  points: RevenuePoint[];
};

export type StudentRevenue = {
  userId: number;
  name: string;
  revenueCents: number;
};

export type TopBuyer = {
  userId: number;
  name: string;
  email: string;
  spendCents: number;
  purchaseCount: number;
  seatsBought: number;
  seatsUnredeemed: number;
  enrolled: boolean;
};

export type RatingSummary = {
  average: number | null;
  count: number;
};

export type CourseRevenue = RevenueSummary & {
  courseId: number;
  title: string;
};

export type Audience = {
  buyerCount: number;
  studentCount: number;
  revenuePerStudentCents: number | null;
};

export type UnansweredQuestions = { inRange: number; older: number };

function scopeOn(dateColumn: SQLiteColumn, scope: AnalyticsScope) {
  const conditions = [];

  if (scope.instructorId !== null) {
    conditions.push(eq(courses.instructorId, scope.instructorId));
  }

  const start = rangeStart(scope.range, scope.now);
  if (start !== null) {
    conditions.push(gte(dateColumn, start));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function purchaseScope(scope: AnalyticsScope) {
  return scopeOn(purchases.createdAt, scope);
}

function getStudentRevenue(db: Db, scope: AnalyticsScope): StudentRevenue[] {
  const students = db
    .selectDistinct({ userId: users.id, name: users.name })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(scopeOn(enrollments.enrolledAt, scope))
    .orderBy(users.name)
    .all();

  if (students.length === 0) return [];

  const studentIds = students.map((student) => student.userId);

  // Correlated: did this purchase mint seats for other people?
  const mintedSeats = db
    .select({ one: sql`1` })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchases.id));

  const direct = db
    .select({ userId: purchases.userId, paid: sum(purchases.amountPaid) })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(
      and(
        inArray(purchases.userId, studentIds),
        notExists(mintedSeats),
        ownedBy(scope.instructorId)
      )
    )
    .groupBy(purchases.userId)
    .all();

  const seatCounts = db
    .select({ purchaseId: coupons.purchaseId, seats: count().as("seats") })
    .from(coupons)
    .groupBy(coupons.purchaseId)
    .as("seat_counts");

  const viaSeat = db
    .select({
      userId: coupons.redeemedByUserId,
      // Divided rather than rounded per row: the shares are summed first and
      // rounded once, so five seats out of 3333 cents still add up.
      paid: sql<number>`sum(${purchases.amountPaid} * 1.0 / ${seatCounts.seats})`,
    })
    .from(coupons)
    .innerJoin(purchases, eq(coupons.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(seatCounts, eq(seatCounts.purchaseId, coupons.purchaseId))
    .where(
      and(
        inArray(coupons.redeemedByUserId, studentIds),
        ownedBy(scope.instructorId)
      )
    )
    .groupBy(coupons.redeemedByUserId)
    .all();

  const paidByUser = new Map<number, number>();
  const credit = (userId: number | null, paid: unknown) => {
    if (userId === null) return;
    paidByUser.set(userId, (paidByUser.get(userId) ?? 0) + Number(paid ?? 0));
  };

  for (const row of direct) credit(row.userId, row.paid);
  for (const row of viaSeat) credit(row.userId, row.paid);

  return students.map((student) => ({
    ...student,
    revenueCents: Math.round(paidByUser.get(student.userId) ?? 0),
  }));
}

const TOP_BUYER_LIMIT = 10;

function getTopBuyers(db: Db, scope: AnalyticsScope): TopBuyer[] {
  const buyers = db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      spend: sum(purchases.amountPaid),
      purchaseCount: count(purchases.id),
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(users.id, purchases.userId))
    .where(purchaseScope(scope))
    .groupBy(users.id)
    .orderBy(desc(sum(purchases.amountPaid)))
    .limit(TOP_BUYER_LIMIT)
    .all();

  if (buyers.length === 0) return [];

  const buyerIds = buyers.map((buyer) => buyer.userId);

  // Seats are counted in their own query: joining coupons to purchases above
  // would repeat each purchase once per seat and multiply the spend the
  // leaderboard ranks on.
  const seats = db
    .select({
      userId: purchases.userId,
      bought: count(coupons.id),
      unredeemed: sql<number>`sum(case when ${coupons.redeemedByUserId} is null then 1 else 0 end)`,
    })
    .from(coupons)
    .innerJoin(purchases, eq(coupons.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(and(inArray(purchases.userId, buyerIds), purchaseScope(scope)))
    .groupBy(purchases.userId)
    .all();

  const seatsByUser = new Map(seats.map((row) => [row.userId, row]));

  // No range here: "never enrolled" is a fact about the person, not about the
  // last thirty days.
  const enrolled = new Set(
    db
      .selectDistinct({ userId: enrollments.userId })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(
        and(inArray(enrollments.userId, buyerIds), ownedBy(scope.instructorId))
      )
      .all()
      .map((row) => row.userId)
  );

  return buyers.map((buyer) => ({
    userId: buyer.userId,
    name: buyer.name,
    email: buyer.email,
    spendCents: Number(buyer.spend ?? 0),
    purchaseCount: buyer.purchaseCount,
    seatsBought: seatsByUser.get(buyer.userId)?.bought ?? 0,
    seatsUnredeemed: Number(seatsByUser.get(buyer.userId)?.unredeemed ?? 0),
    enrolled: enrolled.has(buyer.userId),
  }));
}

function getRatingSummary(db: Db, scope: AnalyticsScope): RatingSummary {
  const row = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: count(courseRatings.id),
    })
    .from(courseRatings)
    .innerJoin(courses, eq(courseRatings.courseId, courses.id))
    .where(scopeOn(courseRatings.createdAt, scope))
    .get();

  if (!row || row.count === 0 || row.average === null) {
    return { average: null, count: 0 };
  }

  return { average: Math.round(row.average * 10) / 10, count: row.count };
}

/** The bucket an ISO timestamp falls in, at the given granularity. */
function bucketOf(iso: string, granularity: "day" | "month"): string {
  return iso.slice(0, granularity === "day" ? 10 : 7);
}

/** Every bucket from `first` to `last` inclusive, with none skipped. */
function bucketRange(
  first: string,
  last: string,
  granularity: "day" | "month"
): string[] {
  const buckets: string[] = [];
  const cursor = new Date(
    `${first}${granularity === "day" ? "" : "-01"}T00:00:00.000Z`
  );

  while (bucketOf(cursor.toISOString(), granularity) <= last) {
    buckets.push(bucketOf(cursor.toISOString(), granularity));
    if (granularity === "day") {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } else {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  return buckets;
}

function getRevenueOverTime(db: Db, scope: AnalyticsScope): RevenueSeries {
  const { range } = scope;
  const granularity = range === "all" ? "month" : "day";
  const bucketExpr = sql<string>`substr(${purchases.createdAt}, 1, ${
    granularity === "day" ? 10 : 7
  })`;

  const rows = db
    .select({ bucket: bucketExpr, gross: sum(purchases.amountPaid) })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(scope))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr)
    .all();

  if (rows.length === 0 && range === "all") return { granularity, points: [] };

  const grossByBucket = new Map(
    rows.map((row) => [row.bucket, Number(row.gross ?? 0)])
  );

  // A fixed range always spans its whole window, even before the first sale;
  // all time can only start where the data does.
  const start = rangeStart(range, scope.now) ?? rows[0].bucket;

  const points = bucketRange(
    bucketOf(start, granularity),
    bucketOf(scope.now.toISOString(), granularity),
    granularity
  ).map((bucket) => {
    const { grossCents, netCents } = splitRevenue(
      grossByBucket.get(bucket) ?? 0
    );
    return { bucket, grossCents, netCents };
  });

  return { granularity, points };
}

// ─── Overview tab ───

export type AnalyticsOverview = {
  summary: RevenueSummary;
  series: RevenueSeries;
  courses: CourseRevenue[];
  audience: Audience;
  buyers: TopBuyer[];
  ratings: RatingSummary;
  questions: UnansweredQuestions;
  refundExposure: RefundExposure;
  unpublished: boolean;
};

/**
 * The overview tab: what the scope earned over its range, who paid, and what
 * still needs the instructor's attention, as of `scope.now`.
 */
export function getAnalyticsOverview(
  scope: AnalyticsScope,
  db: Db = appDb
): AnalyticsOverview {
  const { instructorId, range, now } = scope;

  // Unanswered questions. A question qualifies when it is top-level, not
  // deleted, not written by staff, and has no reply from the course's
  // instructor or an admin.
  const questionsSince = rangeStart(range, now);
  const questionAuthor = alias(users, "author");
  const reply = alias(comments, "reply");
  const replyAuthor = alias(users, "reply_author");

  // Correlated: matches a live reply, by staff, to the outer question.
  const staffReply = db
    .select({ one: sql`1` })
    .from(reply)
    .innerJoin(replyAuthor, eq(replyAuthor.id, reply.userId))
    .where(
      and(
        eq(reply.parentId, comments.id),
        isNull(reply.deletedAt),
        or(
          eq(replyAuthor.role, UserRole.Admin),
          eq(reply.userId, courses.instructorId)
        )
      )
    );

  const questionConditions = [
    isNull(comments.parentId),
    isNull(comments.deletedAt),
    // Staff asking their own question shouldn't queue up as work for themselves.
    ne(questionAuthor.role, UserRole.Admin),
    ne(comments.userId, courses.instructorId),
    notExists(staffReply),
  ];

  if (instructorId !== null) {
    questionConditions.push(eq(courses.instructorId, instructorId));
  }

  const questionRow = db
    .select({
      inRange:
        questionsSince === null
          ? count(comments.id)
          : sql<number>`sum(case when ${comments.createdAt} >= ${questionsSince} then 1 else 0 end)`,
      total: count(comments.id),
    })
    .from(comments)
    .innerJoin(questionAuthor, eq(comments.userId, questionAuthor.id))
    .innerJoin(lessons, eq(comments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(...questionConditions))
    .get();

  // sum() is null over an empty set; count() is already 0.
  const questionsInRange = Number(questionRow?.inRange ?? 0);
  const questions = {
    inRange: questionsInRange,
    older: (questionRow?.total ?? 0) - questionsInRange,
  };

  // Gross revenue, the platform's fee and the instructor's net for the range.
  const summaryRow = db
    .select({
      gross: sum(purchases.amountPaid),
      purchaseCount: count(purchases.id),
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(scope))
    .get();

  // sum() returns null over an empty set, and a string when SQLite has rows.
  const summary: RevenueSummary = {
    ...splitRevenue(Number(summaryRow?.gross ?? 0)),
    purchaseCount: summaryRow?.purchaseCount ?? 0,
  };

  // Revenue broken down by course, biggest earner first. Courses with no sales
  // in the range are absent rather than listed at zero.
  const courseRevenueRows = db
    .select({
      courseId: courses.id,
      title: courses.title,
      gross: sum(purchases.amountPaid),
      purchaseCount: count(purchases.id),
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(scope))
    .groupBy(courses.id)
    .all();

  const courseRevenue = courseRevenueRows
    .map((row) => ({
      courseId: row.courseId,
      title: row.title,
      ...splitRevenue(Number(row.gross ?? 0)),
      purchaseCount: row.purchaseCount,
    }))
    .sort((a, b) => b.grossCents - a.grossCents);

  // How many people paid, and how many are learning. Deliberately two numbers:
  // one team purchase is a single buyer covering several seats, and someone who
  // redeems a seat enrols without a purchase row of their own.
  const buyerCountRow = db
    .select({ buyerCount: countDistinct(purchases.userId) })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(scope))
    .get();

  const students = getStudentRevenue(db, scope);
  const attributedRevenue = students.reduce(
    (total, student) => total + student.revenueCents,
    0
  );

  const audience = {
    buyerCount: buyerCountRow?.buyerCount ?? 0,
    studentCount: students.length,
    revenuePerStudentCents:
      students.length === 0
        ? null
        : Math.round(attributedRevenue / students.length),
  };

  // Drives the "publish your first course" empty state. The platform-wide view
  // always has courses in it, so the prompt only makes sense for one named
  // instructor.
  const publishedRow =
    instructorId === null
      ? undefined
      : db
          .select({ id: courses.id })
          .from(courses)
          .where(
            and(
              eq(courses.instructorId, instructorId),
              eq(courses.status, CourseStatus.Published)
            )
          )
          .get();

  // Refund exposure. Every purchase in the range, then the ones still inside
  // their refund window as of the scope's now, grouped up.
  const exposureRows = db
    .select({
      courseId: courses.id,
      title: courses.title,
      amountPaid: purchases.amountPaid,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(scope))
    .all();

  const refundExposure = computeRefundExposure(
    exposureRows,
    summary.grossCents,
    now
  );

  return {
    summary,
    series: getRevenueOverTime(db, scope),
    courses: courseRevenue,
    audience,
    buyers: getTopBuyers(db, scope),
    ratings: getRatingSummary(db, scope),
    // Split rather than filtered: the range applies, but questions older than
    // it are still reported, because months of silence is the urgent case.
    questions,
    refundExposure,
    unpublished: instructorId !== null && publishedRow === undefined,
  };
}

/**
 * Everyone who owns at least one course, for the admin's instructor picker.
 * Owners rather than users with the instructor role: an admin who owns a
 * course contributes to the platform-wide total.
 */
export function listAnalyticsInstructors(
  db: Db = appDb
): { id: number; name: string }[] {
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .orderBy(users.name)
    .all();
}

// ─── Course tab ───

export type CourseAnalytics = {
  courseOptions: { courseId: number; title: string }[];
  selectedCourseId: number | null;
  progress: CourseProgressSummary | null;
  funnel: CourseFunnel | null;
  quizzes: QuizPassRate[] | null;
  countries: CourseCountryRevenue | null;
};

/**
 * The course tab: the courses in scope to choose from, and the figures for
 * the one asked for. A course outside the scope is never selected, so its
 * panels come back null — an instructor may not read another instructor's
 * funnel by putting its id in the URL.
 */
export function getCourseAnalytics(
  scope: AnalyticsScope,
  requestedCourseId: number | null,
  db: Db = appDb
): CourseAnalytics {
  // The selector lists every course the viewer owns rather than only the ones
  // that sold: a course nobody is finishing is exactly what this tab is for.
  const courseOptions = db
    .select({ courseId: courses.id, title: courses.title })
    .from(courses)
    .where(ownedBy(scope.instructorId))
    .orderBy(courses.title)
    .all();

  const selectedCourseId = courseOptions.some(
    (course) => course.courseId === requestedCourseId
  )
    ? requestedCourseId
    : null;

  if (selectedCourseId === null) {
    return {
      courseOptions,
      selectedCourseId,
      progress: null,
      funnel: null,
      quizzes: null,
      countries: null,
    };
  }

  return {
    courseOptions,
    selectedCourseId,
    // Progress and drop-off carry no usable timestamp, so they span all time
    // whatever the range control says — and the tab says so on screen.
    progress: getCourseProgressSummary(db, selectedCourseId),
    funnel: getCourseDropOff(db, selectedCourseId),
    // Quiz attempts and purchases are both timestamped, so unlike the two
    // panels above these do honour the range control.
    quizzes: getCourseQuizPassRates(db, selectedCourseId, scope),
    countries: getCourseRevenueByCountry(db, selectedCourseId, scope),
  };
}

/** Every lesson of a course, as a subquery for the progress joins. */
function courseLessonIds(db: Db, courseId: number) {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId));
}

function getCourseProgressSummary(
  db: Db,
  courseId: number
): CourseProgressSummary {
  const totals = db
    .select({ totalLessons: count(lessons.id) })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .get();

  const totalLessons = totals?.totalLessons ?? 0;

  // One grouped row per enrollee, including the ones who never started: a
  // student who bought and vanished is the finding, so a left join keeps them.
  const perStudent = db
    .select({
      userId: enrollments.userId,
      completed: countDistinct(lessonProgress.lessonId),
    })
    .from(enrollments)
    .leftJoin(
      lessonProgress,
      and(
        eq(lessonProgress.userId, enrollments.userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, courseLessonIds(db, courseId))
      )
    )
    .where(eq(enrollments.courseId, courseId))
    .groupBy(enrollments.userId)
    .all();

  if (perStudent.length === 0 || totalLessons === 0) {
    return {
      enrolledCount: perStudent.length,
      totalLessons,
      averageProgressPercent: null,
      finishedCount: 0,
    };
  }

  const totalPercent = perStudent.reduce(
    (running, student) => running + (student.completed / totalLessons) * 100,
    0
  );

  return {
    enrolledCount: perStudent.length,
    totalLessons,
    averageProgressPercent: Math.round(totalPercent / perStudent.length),
    finishedCount: perStudent.filter(
      (student) => student.completed >= totalLessons
    ).length,
  };
}

/** A lesson a student has opened counts as reached; one they haven't doesn't. */
const REACHED_STATUSES = [
  LessonProgressStatus.InProgress,
  LessonProgressStatus.Completed,
];

function getCourseDropOff(db: Db, courseId: number): CourseFunnel {
  const enrolled = db
    .select({ enrolledCount: countDistinct(enrollments.userId) })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .get();

  const enrolledCount = enrolled?.enrolledCount ?? 0;

  const curriculum = db
    .select({
      moduleId: modules.id,
      moduleTitle: modules.title,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
    })
    .from(modules)
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(modules.position, lessons.position)
    .all();

  if (curriculum.length === 0) return { enrolledCount, modules: [] };

  const positionOf = new Map(
    curriculum.map((row, position) => [row.lessonId, position])
  );

  // Enrolment is joined rather than filtered afterwards, so somebody working
  // through a course they never enrolled in cannot inflate a bar past the
  // denominator underneath it.
  const touched = db
    .selectDistinct({
      userId: lessonProgress.userId,
      lessonId: lessonProgress.lessonId,
    })
    .from(lessonProgress)
    .innerJoin(
      enrollments,
      and(
        eq(enrollments.userId, lessonProgress.userId),
        eq(enrollments.courseId, courseId)
      )
    )
    .where(
      and(
        inArray(lessonProgress.lessonId, courseLessonIds(db, courseId)),
        inArray(lessonProgress.status, REACHED_STATUSES)
      )
    )
    .all();

  const furthest = new Map<number, number>();
  for (const row of touched) {
    const position = positionOf.get(row.lessonId);
    if (position === undefined) continue;
    furthest.set(
      row.userId,
      Math.max(furthest.get(row.userId) ?? -1, position)
    );
  }

  // Counted backwards from the end: everyone who stopped at a later lesson
  // passed through this one, which is the whole definition of the bar.
  const stoppedAt = curriculum.map(() => 0);
  for (const position of furthest.values()) stoppedAt[position] += 1;

  const reachedAt: number[] = [];
  let running = 0;
  for (let position = curriculum.length - 1; position >= 0; position--) {
    running += stoppedAt[position];
    reachedAt[position] = running;
  }

  const grouped: FunnelModule[] = [];
  let previousReached = enrolledCount;

  curriculum.forEach((row, position) => {
    const reachedCount = reachedAt[position];
    const lesson: FunnelLesson = {
      lessonId: row.lessonId,
      title: row.lessonTitle,
      reachedCount,
      dropFromPrevious: previousReached - reachedCount,
    };
    previousReached = reachedCount;

    const current = grouped.at(-1);
    if (current?.moduleId === row.moduleId) {
      current.lessons.push(lesson);
      current.dropWithin = current.reachedCount - reachedCount;
    } else {
      grouped.push({
        moduleId: row.moduleId,
        title: row.moduleTitle,
        reachedCount,
        dropWithin: 0,
        lessons: [lesson],
      });
    }
  });

  return { enrolledCount, modules: grouped };
}

function getCourseQuizPassRates(
  db: Db,
  courseId: number,
  scope: AnalyticsScope
): QuizPassRate[] {
  const quizRows = db
    .select({
      quizId: quizzes.id,
      title: quizzes.title,
      passingScore: quizzes.passingScore,
      moduleTitle: modules.title,
      lessonTitle: lessons.title,
    })
    .from(quizzes)
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(modules.position, lessons.position, quizzes.id)
    .all();

  if (quizRows.length === 0) return [];

  const quizIds = quizRows.map((quiz) => quiz.quizId);

  // One row per student per quiz, holding the best they managed.
  //
  // `passed` and `score` are selected bare beside `max(score)`: SQLite answers
  // those from the very row the maximum came from, which is how the best
  // attempt's own recorded verdict is read rather than a fresh comparison.
  const bestAttempts = db
    .select({
      quizId: quizAttempts.quizId,
      bestScore: sql<number>`max(${quizAttempts.score})`.as("best_score"),
      passed: sql<number>`${quizAttempts.passed}`.as("best_passed"),
    })
    .from(quizAttempts)
    .where(
      and(
        inArray(quizAttempts.quizId, quizIds),
        sinceRange(quizAttempts.attemptedAt, scope)
      )
    )
    .groupBy(quizAttempts.quizId, quizAttempts.userId)
    .as("best_attempts");

  const stats = db
    .select({
      quizId: bestAttempts.quizId,
      studentCount: count(),
      passedCount: sql<number>`sum(${bestAttempts.passed})`,
      averageBestScore: sql<number>`avg(${bestAttempts.bestScore})`,
    })
    .from(bestAttempts)
    .groupBy(bestAttempts.quizId)
    .all();

  const statsByQuiz = new Map(stats.map((row) => [row.quizId, row]));

  return quizRows.map((quiz) => {
    const row = statsByQuiz.get(quiz.quizId);
    const studentCount = row?.studentCount ?? 0;
    const passedCount = Number(row?.passedCount ?? 0);

    return {
      quizId: quiz.quizId,
      title: quiz.title,
      moduleTitle: quiz.moduleTitle,
      lessonTitle: quiz.lessonTitle,
      passingScorePercent: Math.round(quiz.passingScore * 100),
      studentCount,
      passedCount,
      passRatePercent:
        studentCount === 0
          ? null
          : Math.round((passedCount / studentCount) * 100),
      averageBestScorePercent:
        studentCount === 0
          ? null
          : Math.round(Number(row?.averageBestScore ?? 0) * 100),
    };
  });
}

function getCourseRevenueByCountry(
  db: Db,
  courseId: number,
  scope: AnalyticsScope
): CourseCountryRevenue {
  const rows = db
    .select({
      country: purchases.country,
      gross: sum(purchases.amountPaid),
      purchaseCount: count(purchases.id),
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.courseId, courseId),
        sinceRange(purchases.createdAt, scope)
      )
    )
    .groupBy(purchases.country)
    .all()
    .map((row) => ({
      country: row.country,
      grossCents: Number(row.gross ?? 0),
      purchaseCount: row.purchaseCount,
    }))
    .sort((a, b) => b.grossCents - a.grossCents);

  const grossCents = rows.reduce((total, row) => total + row.grossCents, 0);
  const purchaseCount = rows.reduce(
    (total, row) => total + row.purchaseCount,
    0
  );

  const share = (cents: number) =>
    grossCents === 0 ? 0 : Math.round((cents / grossCents) * 100);

  let discountedGrossCents = 0;

  const breakdown = rows.map((row) => {
    const discountPercent =
      row.country === null ? null : getDiscountForCountry(row.country) * 100;

    if (discountPercent !== null && discountPercent > 0) {
      discountedGrossCents += row.grossCents;
    }

    return {
      ...row,
      netCents: splitRevenue(row.grossCents).netCents,
      sharePercent: share(row.grossCents),
      averagePaidCents: Math.round(row.grossCents / row.purchaseCount),
      discountPercent,
    };
  });

  return {
    grossCents,
    netCents: splitRevenue(grossCents).netCents,
    purchaseCount,
    discountedGrossCents,
    discountedNetCents: splitRevenue(discountedGrossCents).netCents,
    discountedSharePercent: share(discountedGrossCents),
    rows: breakdown,
  };
}

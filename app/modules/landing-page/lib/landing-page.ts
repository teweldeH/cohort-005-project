import { count, desc, eq, inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  categories,
  courses,
  CourseStatus,
  enrollments,
  lessons,
  modules,
  users,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export const FEATURED_COURSE_LIMIT = 3;

export type FeaturedCourse = {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  instructorName: string;
  categoryName: string;
  enrollmentCount: number;
  lessonCount: number;
};

export type LandingPage = {
  featuredCourses: FeaturedCourse[];
  totalCourses: number;
  totalCategories: number;
  totalEnrollments: number;
};

const isPublished = eq(courses.status, CourseStatus.Published);

function getFeaturedCourses(db: Db): FeaturedCourse[] {
  const enrollmentCounts = db
    .select({
      courseId: enrollments.courseId,
      total: count().as("enrollment_total"),
    })
    .from(enrollments)
    .groupBy(enrollments.courseId)
    .as("enrollment_counts");

  const lessonCounts = db
    .select({ courseId: modules.courseId, total: count().as("lesson_total") })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .groupBy(modules.courseId)
    .as("lesson_counts");

  const enrollmentCount = sql<number>`coalesce(${enrollmentCounts.total}, 0)`;

  return (
    db
      .select({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        description: courses.description,
        coverImageUrl: courses.coverImageUrl,
        instructorName: users.name,
        categoryName: categories.name,
        enrollmentCount,
        lessonCount: sql<number>`coalesce(${lessonCounts.total}, 0)`,
      })
      .from(courses)
      .innerJoin(users, eq(courses.instructorId, users.id))
      .innerJoin(categories, eq(courses.categoryId, categories.id))
      .leftJoin(enrollmentCounts, eq(enrollmentCounts.courseId, courses.id))
      .leftJoin(lessonCounts, eq(lessonCounts.courseId, courses.id))
      .where(isPublished)
      // A tie goes to the newer course; id breaks a tie on createdAt so the
      // order is stable when courses are seeded in the same millisecond.
      .orderBy(desc(enrollmentCount), desc(courses.createdAt), desc(courses.id))
      .limit(FEATURED_COURSE_LIMIT)
      .all()
  );
}

export async function getLandingPage(db: Db): Promise<LandingPage> {
  const publishedCourseIds = db
    .select({ id: courses.id })
    .from(courses)
    .where(isPublished);

  const [totalCourses, totalCategories, totalEnrollments] = await Promise.all([
    db.$count(courses, isPublished),
    db.$count(categories),
    db.$count(enrollments, inArray(enrollments.courseId, publishedCourseIds)),
  ]);

  return {
    featuredCourses: getFeaturedCourses(db),
    totalCourses,
    totalCategories,
    totalEnrollments,
  };
}

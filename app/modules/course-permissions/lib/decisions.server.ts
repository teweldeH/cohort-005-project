import { and, desc, eq, notExists } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  coupons,
  courses,
  enrollments,
  purchases,
  refunds,
  RefundStatus,
  users,
  UserRole,
} from "~/db/schema";
import { checkPppAccess } from "~/lib/ppp";

export type Db = BetterSQLite3Database<typeof schema>;

/** Who is asking: a signed-in user and the country they're in, or nobody. */
export type Viewer = { userId: number; country: string | null } | null;

export type DenialReason =
  | { kind: "signed-out" }
  | { kind: "course-not-found" }
  | { kind: "no-enrollment" }
  | {
      kind: "outside-purchase-country";
      /** Where the discounted Purchase was made. */
      purchaseCountry: string;
      /** Where the viewer is now. */
      currentCountry: string;
    }
  | { kind: "not-course-manager" };

export type Decision =
  { allowed: true } | { allowed: false; reason: DenialReason };

const ALLOWED: Decision = { allowed: true };

function deny(reason: DenialReason): Decision {
  return { allowed: false, reason };
}

type Course = typeof courses.$inferSelect;
type User = typeof users.$inferSelect;

type UserAndCourse =
  | { found: true; user: User; course: Course; country: string | null }
  | { found: false; denial: Decision };

function findUserAndCourse(
  db: Db,
  viewer: Viewer,
  courseId: number
): UserAndCourse {
  const user = viewer && findUser(db, viewer.userId);
  if (!viewer || !user) {
    return { found: false, denial: deny({ kind: "signed-out" }) };
  }

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) {
    return { found: false, denial: deny({ kind: "course-not-found" }) };
  }

  return { found: true, user, course, country: viewer.country };
}

/**
 * The Instructor who owns the course, or any Platform Admin. Ownership, not
 * role: an owner who has since lost the Instructor role still counts.
 */
function isCourseManager(user: User, course: Course) {
  return user.role === UserRole.Admin || course.instructorId === user.id;
}

export function mayManageCourse(
  viewer: Viewer,
  courseId: number,
  db: Db
): Decision {
  const subject = findUserAndCourse(db, viewer, courseId);
  if (!subject.found) return subject.denial;

  return isCourseManager(subject.user, subject.course)
    ? ALLOWED
    : deny({ kind: "not-course-manager" });
}

export function mayTakeCourse(
  viewer: Viewer,
  courseId: number,
  db: Db
): Decision {
  const subject = findUserAndCourse(db, viewer, courseId);
  if (!subject.found) return subject.denial;
  const { user, course, country } = subject;

  // Course Managers read without an Enrollment and are exempt from the
  // purchase-country check (ADR-0009).
  if (isCourseManager(user, course)) return ALLOWED;

  const enrollment = db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, user.id), eq(enrollments.courseId, course.id))
    )
    .get();
  if (!enrollment) return deny({ kind: "no-enrollment" });

  const purchase = findCheckedPurchase(db, user.id, course.id);

  const ppp = checkPppAccess(
    course.price,
    course.pppEnabled,
    purchase?.country ?? null,
    country
  );
  if (ppp.blocked && ppp.purchaseCountry && ppp.blockedCountry) {
    return deny({
      kind: "outside-purchase-country",
      purchaseCountry: ppp.purchaseCountry,
      currentCountry: ppp.blockedCountry,
    });
  }

  return ALLOWED;
}

/**
 * The Purchase whose country the purchase-country check uses (ADR-0013): the
 * buyer's newest Individual Purchase of the course with no Approved Refund
 * Request. A Student on a Claimed Seat has none of their own, so none is
 * checked.
 */
function findCheckedPurchase(db: Db, userId: number, courseId: number) {
  return db
    .select({ country: purchases.country })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, userId),
        eq(purchases.courseId, courseId),
        // An Individual Purchase: a Team Licence is the Purchase that granted Seats.
        notExists(
          db
            .select({ id: coupons.id })
            .from(coupons)
            .where(eq(coupons.purchaseId, purchases.id))
        ),
        notExists(
          db
            .select({ id: refunds.id })
            .from(refunds)
            .where(
              and(
                eq(refunds.purchaseId, purchases.id),
                eq(refunds.status, RefundStatus.Approved)
              )
            )
        )
      )
    )
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .get();
}

/** The user, or undefined once they no longer exist: a session can outlive its user. */
export function findUser(db: Db, userId: number): User | undefined {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

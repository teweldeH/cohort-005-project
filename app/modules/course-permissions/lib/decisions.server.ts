import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { courses, enrollments, purchases, users, UserRole } from "~/db/schema";
import { checkPppAccess } from "~/lib/ppp";

export type Db = BetterSQLite3Database<typeof schema>;

/** Who is asking: a signed-in user and the country they're in, or nobody. */
export type Viewer = { userId: number; country: string | null } | null;

/** Why a viewer may not do something with a course. */
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

type Lookup =
  | { ok: true; user: User; course: Course; country: string | null }
  | { ok: false; decision: Decision };

/** The signed-in user and the course, or the reason we can't go further. */
function lookUp(db: Db, viewer: Viewer, courseId: number): Lookup {
  if (!viewer) return { ok: false, decision: deny({ kind: "signed-out" }) };

  const user = db.select().from(users).where(eq(users.id, viewer.userId)).get();
  if (!user) return { ok: false, decision: deny({ kind: "signed-out" }) };

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) {
    return { ok: false, decision: deny({ kind: "course-not-found" }) };
  }

  return { ok: true, user, course, country: viewer.country };
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
  const found = lookUp(db, viewer, courseId);
  if (!found.ok) return found.decision;

  return isCourseManager(found.user, found.course)
    ? ALLOWED
    : deny({ kind: "not-course-manager" });
}

export function mayTakeCourse(
  viewer: Viewer,
  courseId: number,
  db: Db
): Decision {
  const found = lookUp(db, viewer, courseId);
  if (!found.ok) return found.decision;
  const { user, course, country } = found;

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

  // The first Purchase row found, as before. Choosing the right Purchase
  // (ADR-0013) is a follow-up.
  const purchase = db
    .select()
    .from(purchases)
    .where(
      and(eq(purchases.userId, user.id), eq(purchases.courseId, course.id))
    )
    .get();

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

/** Whether the user still exists — a session can outlive its user. */
export function userExists(db: Db, userId: number): boolean {
  return !!db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .get();
}

/** The user's platform role, or null if they no longer exist. */
export function findRole(db: Db, userId: number): UserRole | null {
  const user = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return user?.role ?? null;
}

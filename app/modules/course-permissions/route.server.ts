// ─── Course Permissions: route-edge entry point ───
// Where HTTP meets the decisions: turns a request into a Viewer (session user
// and resolved country), and a denial into a thrown 401, 403 or 404 with one
// message per reason. Loaders and actions call these; nothing else should
// read the session to decide course access.
import { data } from "react-router";
import { db as appDb } from "~/db";
import { resolveCountry } from "~/lib/country.server";
import { getCurrentUserId } from "~/lib/session";
import { UserRole } from "~/db/schema";
import {
  findRole,
  userExists,
  type Db,
  type Decision,
  type DenialReason,
  type Viewer,
} from "./lib/decisions.server";
import { denialStatusAndMessage } from "./lib/messages";
import { mayManageCourse, mayTakeCourse } from "./permissions.server";

export type SignedInViewer = NonNullable<Viewer>;

/**
 * The viewer behind a request, or null when nobody is signed in — including a
 * session whose user no longer exists.
 */
export async function getViewer(
  request: Request,
  db: Db = appDb
): Promise<Viewer> {
  const userId = await getCurrentUserId(request);
  if (userId === null || !userExists(db, userId)) return null;
  return { userId, country: await resolveCountry(request) };
}

/** The response to throw for a denial: `throw denialResponse(reason)`. */
export function denialResponse(reason: DenialReason) {
  const { status, message } = denialStatusAndMessage(reason);
  return data(message, { status });
}

/** Throws the denial's response unless the decision allows. */
export function enforce(decision: Decision): void {
  if (!decision.allowed) throw denialResponse(decision.reason);
}

/** The signed-in viewer, or a thrown 401. */
export async function requireViewer(
  request: Request,
  db: Db = appDb
): Promise<SignedInViewer> {
  const viewer = await getViewer(request, db);
  if (!viewer) throw denialResponse({ kind: "signed-out" });
  return viewer;
}

/** The viewer if they may take the course, or the denial thrown. */
export async function requireCourseTaker(
  request: Request,
  courseId: number,
  db: Db = appDb
): Promise<SignedInViewer> {
  const viewer = await requireViewer(request, db);
  enforce(mayTakeCourse(viewer, courseId, db));
  return viewer;
}

/** The viewer if they may manage the course, or the denial thrown. */
export async function requireCourseManager(
  request: Request,
  courseId: number,
  db: Db = appDb
): Promise<SignedInViewer> {
  const viewer = await requireViewer(request, db);
  enforce(mayManageCourse(viewer, courseId, db));
  return viewer;
}

/**
 * The signed-in Instructor or Platform Admin, for pages that span all of
 * someone's courses rather than one. A 401 when signed out, a 403 otherwise.
 */
export async function requireInstructorOrAdmin(
  request: Request,
  db: Db = appDb
): Promise<SignedInViewer & { isAdmin: boolean }> {
  const viewer = await requireViewer(request, db);
  const role = findRole(db, viewer.userId);
  if (role !== UserRole.Instructor && role !== UserRole.Admin) {
    throw data("Only instructors can access this page.", { status: 403 });
  }
  return { ...viewer, isAdmin: role === UserRole.Admin };
}

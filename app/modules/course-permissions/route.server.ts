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
  findUser,
  type Db,
  type Decision,
  type DenialReason,
  type Viewer,
} from "./lib/decisions.server";
import { denialStatusAndMessage } from "./lib/messages";
import { mayManageCourse } from "./permissions.server";

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
  if (userId === null || !findUser(db, userId)) return null;
  return { userId, country: await resolveCountry(request) };
}

export function denialResponse(reason: DenialReason) {
  const { status, message } = denialStatusAndMessage(reason);
  return data(message, { status });
}

export function enforce(decision: Decision): void {
  if (!decision.allowed) throw denialResponse(decision.reason);
}

export async function requireViewer(
  request: Request,
  db: Db = appDb
): Promise<SignedInViewer> {
  const viewer = await getViewer(request, db);
  if (!viewer) throw denialResponse({ kind: "signed-out" });
  return viewer;
}

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
  const role = findUser(db, viewer.userId)?.role;
  if (role !== UserRole.Instructor && role !== UserRole.Admin) {
    throw data("Only instructors and platform admins can open this page.", {
      status: 403,
    });
  }
  return { ...viewer, isAdmin: role === UserRole.Admin };
}

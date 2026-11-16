// ─── Course Permissions: decisions entry point ───
// Two questions about a viewer and a course, each answered with a decision:
// allowed, or denied with a reason. Plain values in, no HTTP. Runs against the
// app database unless a caller passes another (tests do).
//
//   take the course   — read lessons, write progress, submit quizzes, post
//                       Discussions, Notes and Bookmarks
//   manage the course — edit the course, see its Students, moderate its
//                       Discussions
import { db as appDb } from "~/db";
import {
  mayManageCourse as decideManage,
  mayTakeCourse as decideTake,
  type Db,
  type Decision,
  type Viewer,
} from "./lib/decisions.server";

export type { Decision, DenialReason, Viewer } from "./lib/decisions.server";

/**
 * May the viewer take the course? Course Managers may. Anyone else needs an
 * Enrollment and must not be outside the country of a discounted Purchase.
 */
export function mayTakeCourse(
  viewer: Viewer,
  courseId: number,
  db: Db = appDb
): Decision {
  return decideTake(viewer, courseId, db);
}

/** May the viewer manage the course? Only its Course Managers may. */
export function mayManageCourse(
  viewer: Viewer,
  courseId: number,
  db: Db = appDb
): Decision {
  return decideManage(viewer, courseId, db);
}

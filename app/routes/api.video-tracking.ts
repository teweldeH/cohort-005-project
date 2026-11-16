import { data } from "react-router";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.video-tracking";
import { mayTakeCourse } from "~/modules/course-permissions/permissions.server";
import {
  enforce,
  requireViewer,
} from "~/modules/course-permissions/route.server";
import { parseJsonBody } from "~/lib/validation";
import { db } from "~/db";
import { lessons, modules, videoWatchEvents } from "~/db/schema";

const videoTrackingSchema = z.object({
  lessonId: z.number(),
  eventType: z.string(),
  positionSeconds: z.number(),
});

function getLessonCourseId(lessonId: number) {
  return db
    .select({ courseId: modules.courseId })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(lessons.id, lessonId))
    .get()?.courseId;
}

// Watch events feed Watched time, and so a course's Watch Limit for refunds:
// only someone who may take the lesson's course may record them.
export async function action({ request }: Route.ActionArgs) {
  const viewer = await requireViewer(request);

  const parsed = await parseJsonBody(request, videoTrackingSchema);

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { lessonId, eventType, positionSeconds } = parsed.data;

  const courseId = getLessonCourseId(lessonId);
  if (courseId === undefined) {
    throw data("Lesson not found", { status: 404 });
  }
  enforce(mayTakeCourse(viewer, courseId));

  db.insert(videoWatchEvents)
    .values({
      userId: viewer.userId,
      lessonId,
      eventType,
      positionSeconds,
    })
    .returning()
    .get();

  return { success: true };
}

import { describe, it, expect, beforeEach } from "vitest";
import { UserRole } from "~/db/schema";
import { setCurrentUserId, setDevCountry } from "~/lib/session";
import { mayTakeCourse } from "../permissions.server";
import {
  enforce,
  getViewer,
  requireCourseManager,
  requireInstructorOrAdmin,
  requireViewer,
} from "../route.server";
import { createWorld, type World } from "./fixtures";

let world: World;

beforeEach(() => {
  world = createWorld();
});

// A request carrying a real session cookie, built the way the DevUI panel
// sets one.
async function requestAs(
  userId: number | null,
  options: { devCountry?: string; headers?: Record<string, string> } = {}
) {
  let cookie = "";
  const withCookie = () =>
    new Request("http://localhost/", {
      headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}) },
    });

  if (userId !== null) {
    cookie = (await setCurrentUserId(withCookie(), userId)).split(";")[0];
  }
  if (options.devCountry) {
    cookie = (await setDevCountry(withCookie(), options.devCountry)).split(
      ";"
    )[0];
  }
  return withCookie();
}

/** The status and message a route-edge call throws, or null if it didn't. */
async function thrown(call: Promise<unknown>) {
  try {
    await call;
    return null;
  } catch (error) {
    const response = error as { data: unknown; init: { status: number } };
    return { status: response.init.status, message: response.data };
  }
}

describe("getViewer", () => {
  it("is nobody without a session", async () => {
    expect(await getViewer(await requestAs(null), world.db)).toBeNull();
  });

  it("is the session's user, in an unknown country by default", async () => {
    expect(await getViewer(await requestAs(world.user.id), world.db)).toEqual({
      userId: world.user.id,
      country: null,
    });
  });

  it("takes the country from the DevUI override", async () => {
    const request = await requestAs(world.user.id, { devCountry: "IN" });

    expect(await getViewer(request, world.db)).toEqual({
      userId: world.user.id,
      country: "IN",
    });
  });

  it("takes the country from the CF-IPCountry header", async () => {
    const request = await requestAs(world.user.id, {
      headers: { "CF-IPCountry": "BR" },
    });

    expect(await getViewer(request, world.db)).toEqual({
      userId: world.user.id,
      country: "BR",
    });
  });

  it("is nobody when the session's user has been deleted", async () => {
    const gone = world.addUser(UserRole.Student);
    world.deleteUser(gone.id);

    expect(await getViewer(await requestAs(gone.id), world.db)).toBeNull();
  });
});

/** What a lesson action does before letting the viewer take the course. */
async function takeCourse(request: Request, courseId: number) {
  const viewer = await requireViewer(request, world.db);
  enforce(mayTakeCourse(viewer, courseId, world.db));
}

describe("denials become responses", () => {
  it("signed out is a 401", async () => {
    const request = await requestAs(null);

    expect(await thrown(takeCourse(request, world.course.id))).toEqual({
      status: 401,
      message: "Sign in to continue.",
    });
  });

  it("course not found is a 404", async () => {
    const request = await requestAs(world.user.id);

    expect(await thrown(takeCourse(request, 9999))).toEqual({
      status: 404,
      message: "Course not found.",
    });
  });

  it("no Enrollment is a 403", async () => {
    const request = await requestAs(world.user.id);

    expect(await thrown(takeCourse(request, world.course.id))).toEqual({
      status: 403,
      message: "You must be enrolled in this course.",
    });
  });

  it("outside the purchase country is a 403", async () => {
    const course = world.addCourse(world.instructor.id, { price: 10000 });
    world.buy(world.user.id, course.id, "IN");
    const request = await requestAs(world.user.id, { devCountry: "US" });

    expect(await thrown(takeCourse(request, course.id))).toEqual({
      status: 403,
      message:
        "This course was bought at a discount in another country, so it can only be taken from there.",
    });
  });

  it("not a Course Manager is a 403", async () => {
    const request = await requestAs(world.user.id);

    expect(
      await thrown(requireCourseManager(request, world.course.id, world.db))
    ).toEqual({
      status: 403,
      message: "Only this course's instructor or a platform admin can do that.",
    });
  });

  it("an allowed viewer comes back", async () => {
    const request = await requestAs(world.instructor.id);

    expect(
      await requireCourseManager(request, world.course.id, world.db)
    ).toEqual({ userId: world.instructor.id, country: null });
  });
});

describe("requireInstructorOrAdmin", () => {
  it("lets an Instructor in", async () => {
    const request = await requestAs(world.instructor.id);

    expect(await requireInstructorOrAdmin(request, world.db)).toMatchObject({
      userId: world.instructor.id,
      isAdmin: false,
    });
  });

  it("lets a Platform Admin in, flagged as one", async () => {
    const admin = world.addUser(UserRole.Admin);
    const request = await requestAs(admin.id);

    expect(await requireInstructorOrAdmin(request, world.db)).toMatchObject({
      userId: admin.id,
      isAdmin: true,
    });
  });

  it("turns a Student away with a 403", async () => {
    const request = await requestAs(world.user.id);

    expect(await thrown(requireInstructorOrAdmin(request, world.db))).toEqual({
      status: 403,
      message: "Only instructors and platform admins can open this page.",
    });
  });

  it("turns a signed-out visitor away with a 401", async () => {
    const request = await requestAs(null);

    expect(await thrown(requireInstructorOrAdmin(request, world.db))).toEqual({
      status: 401,
      message: "Sign in to continue.",
    });
  });
});

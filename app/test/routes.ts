import { setCurrentUserId } from "~/lib/session";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import type { TestDb } from "~/test/setup";

// Helpers for calling a route's loader or action directly, as a given user
// from a given country.

/**
 * A request carrying a real session cookie for the user (or none), from the
 * country in the CF-IPCountry header, optionally posting a form.
 */
export async function requestAs(
  userId: number | null,
  options: { country?: string; form?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = {};
  if (options.country) headers["CF-IPCountry"] = options.country;
  if (userId !== null) {
    headers.Cookie = (
      await setCurrentUserId(new Request("http://localhost/"), userId)
    ).split(";")[0];
  }

  if (!options.form) return new Request("http://localhost/", { headers });

  const body = new FormData();
  for (const [key, value] of Object.entries(options.form)) {
    body.set(key, value);
  }
  return new Request("http://localhost/", { method: "POST", headers, body });
}

/** What a loader or action threw: a status and, for a redirect, where to. */
export async function thrown(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    if (error instanceof Response) {
      return {
        status: error.status,
        location: error.headers.get("Location"),
      };
    }
    return { status: (error as { init: { status: number } }).init.status };
  }
  throw new Error("Expected the call to throw, but it returned.");
}

/**
 * A paid course with purchase-country discounts on, owned by the Instructor,
 * and the people around it: a Student who bought it at a discount in India,
 * a Student with no Enrollment, and a Platform Admin.
 */
export function seedDiscountedCourse(db: TestDb, instructorId: number) {
  let n = 0;
  const addUser = (role: UserRole) =>
    db
      .insert(schema.users)
      .values({
        name: `${role} ${++n}`,
        email: `${role}${n}@example.com`,
        role,
      })
      .returning()
      .get();

  const category = db.select().from(schema.categories).get()!;
  const course = db
    .insert(schema.courses)
    .values({
      title: "Discounted Course",
      slug: "discounted-course",
      description: "A course",
      salesCopy: markdown("A course"),
      instructorId,
      categoryId: category.id,
      status: schema.CourseStatus.Published,
      price: 10000,
      pppEnabled: true,
    })
    .returning()
    .get();

  const buyer = addUser(UserRole.Student);
  db.insert(schema.purchases)
    .values({
      userId: buyer.id,
      courseId: course.id,
      amountPaid: 5000,
      country: "IN",
    })
    .run();
  db.insert(schema.enrollments)
    .values({ userId: buyer.id, courseId: course.id })
    .run();

  const stranger = addUser(UserRole.Student);
  const admin = addUser(UserRole.Admin);

  return { course, buyer, stranger, admin };
}

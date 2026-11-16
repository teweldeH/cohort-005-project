import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { eq } from "drizzle-orm";
import { markdown } from "~/lib/text";

// A small in-memory world for course-permissions tests: a Student, the
// Instructor who owns the course, and helpers to add the rest.

export type World = ReturnType<typeof createWorld>;

export function createWorld() {
  const db: TestDb = createTestDb();
  const base = seedBaseData(db);
  let emails = 0;

  function addUser(role: UserRole, name = `${role} ${++emails}`) {
    return db
      .insert(schema.users)
      .values({ name, email: `user${++emails}@example.com`, role })
      .returning()
      .get();
  }

  function addCourse(
    instructorId: number,
    options: { price?: number; pppEnabled?: boolean } = {}
  ) {
    const n = ++emails;
    return db
      .insert(schema.courses)
      .values({
        title: `Course ${n}`,
        slug: `course-${n}`,
        description: "A course",
        salesCopy: markdown("A course"),
        instructorId,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
        price: options.price ?? 0,
        pppEnabled: options.pppEnabled ?? true,
      })
      .returning()
      .get();
  }

  function enrol(userId: number, courseId: number) {
    db.insert(schema.enrollments).values({ userId, courseId }).run();
  }

  function buy(userId: number, courseId: number, country: string | null) {
    db.insert(schema.purchases)
      .values({ userId, courseId, amountPaid: 1000, country })
      .run();
    enrol(userId, courseId);
  }

  /** A Purchase on its own, without the Enrollment it would grant. */
  function addPurchase(
    userId: number,
    courseId: number,
    country: string | null,
    createdAt?: string
  ) {
    return db
      .insert(schema.purchases)
      .values({ userId, courseId, amountPaid: 1000, country, createdAt })
      .returning()
      .get();
  }

  function approveRefund(purchaseId: number) {
    db.insert(schema.refunds)
      .values({
        purchaseId,
        status: schema.RefundStatus.Approved,
        reason: "Changed my mind",
        amountRefunded: 1000,
        resolvedAt: new Date().toISOString(),
      })
      .run();
  }

  function deleteUser(userId: number) {
    db.delete(schema.users).where(eq(schema.users.id, userId)).run();
  }

  function setRole(userId: number, role: UserRole) {
    db.update(schema.users)
      .set({ role })
      .where(eq(schema.users.id, userId))
      .run();
  }

  return {
    db,
    ...base,
    addUser,
    addCourse,
    enrol,
    buy,
    addPurchase,
    approveRefund,
    deleteUser,
    setRole,
  };
}

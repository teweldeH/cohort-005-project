import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { eq } from "drizzle-orm";
import { enrollStudentInTransaction } from "~/lib/enrollments.server";
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
    const result = enrollStudentInTransaction(db, userId, courseId, new Date());
    if (!result.ok) throw new Error(result.error);
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

  /** A Team Licence with one Unclaimed Seat, bought by a Team Admin. */
  function buyTeamLicence(
    teamAdminId: number,
    courseId: number,
    country: string | null,
    createdAt?: string
  ) {
    const team = db.insert(schema.teams).values({}).returning().get();
    db.insert(schema.teamMembers)
      .values({
        teamId: team.id,
        userId: teamAdminId,
        role: schema.TeamMemberRole.Admin,
      })
      .run();
    const purchase = addPurchase(teamAdminId, courseId, country, createdAt);
    const seat = db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId,
        code: `SEAT-${purchase.id}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get();
    return { purchase, seat };
  }

  /** Claim a Seat, which gives the Student an Enrollment. */
  function claimSeat(seatId: number, userId: number) {
    const seat = db
      .update(schema.coupons)
      .set({ redeemedByUserId: userId, redeemedAt: new Date().toISOString() })
      .where(eq(schema.coupons.id, seatId))
      .returning()
      .get();
    enrol(userId, seat.courseId);
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
    buyTeamLicence,
    claimSeat,
    deleteUser,
    setRole,
  };
}

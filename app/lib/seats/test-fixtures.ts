import * as schema from "~/db/schema";
import type { createTestDb, seedBaseData } from "~/test/setup";

type TestDb = ReturnType<typeof createTestDb>;
type BaseData = ReturnType<typeof seedBaseData>;

/**
 * Builders for the Seat management tests: students, Team Purchases with their
 * Seats, Refund Requests and Own Purchase Enrollments, written straight to the
 * test database.
 */
export function seatFixtures(db: TestDb, base: BaseData) {
  function addStudent(email: string, name = email) {
    return db
      .insert(schema.users)
      .values({ name, email, role: schema.UserRole.Student })
      .returning()
      .get();
  }

  /**
   * A Team Purchase by `buyerId` of `seats` Seats on the base course. Seat
   * codes are `<prefix>-<n>`; `claimedBy` claims the first Seats in order.
   */
  function buyTeamPurchase({
    buyerId = base.user.id,
    seats = 2,
    country = "US" as string | null,
    claimedBy = [] as number[],
    prefix = "SEAT",
    amountPaid = 20000,
    courseId = base.course.id,
  } = {}) {
    const team = db.insert(schema.teams).values({}).returning().get();
    const purchase = db
      .insert(schema.purchases)
      .values({ userId: buyerId, courseId, amountPaid, country })
      .returning()
      .get();

    const seatRows = db
      .insert(schema.seats)
      .values(
        Array.from({ length: seats }, (_, i) => ({
          teamId: team.id,
          courseId,
          code: `${prefix}-${i + 1}`,
          purchaseId: purchase.id,
          claimedByUserId: claimedBy[i] ?? null,
          claimedAt: claimedBy[i] ? new Date().toISOString() : null,
        }))
      )
      .returning()
      .all();

    for (const userId of claimedBy) {
      enroll(userId, courseId);
    }

    return { team, purchase, seats: seatRows };
  }

  function addRefundRequest(
    purchaseId: number,
    status: schema.RefundRequestStatus
  ) {
    return db
      .insert(schema.refundRequests)
      .values({ purchaseId, status, reason: "Changed our minds" })
      .returning()
      .get();
  }

  function enroll(userId: number, courseId = base.course.id) {
    return db
      .insert(schema.enrollments)
      .values({ userId, courseId })
      .returning()
      .get();
  }

  return { addStudent, buyTeamPurchase, addRefundRequest, enroll };
}

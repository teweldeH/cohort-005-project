import { describe, it, expect, beforeEach, vi } from "vitest";
import * as schema from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import { getTeamForBuyer } from "./teams.server";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

describe("getTeamForBuyer", () => {
  let base: ReturnType<typeof seedBaseData>;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  function addStudent(email: string) {
    return testDb
      .insert(schema.users)
      .values({ name: email, email, role: schema.UserRole.Student })
      .returning()
      .get();
  }

  function buySeats(buyerId: number, claimerIds: number[] = []) {
    const team = testDb.insert(schema.teams).values({}).returning().get();
    const purchase = testDb
      .insert(schema.purchases)
      .values({ userId: buyerId, courseId: base.course.id, amountPaid: 10000 })
      .returning()
      .get();

    testDb
      .insert(schema.seats)
      .values(
        [0, 1].map((i) => ({
          teamId: team.id,
          courseId: base.course.id,
          code: `SEAT-${purchase.id}-${i}`,
          purchaseId: purchase.id,
          claimedByUserId: claimerIds[i] ?? null,
        }))
      )
      .run();

    return team;
  }

  it("finds the team the Buyer bought Seats for", () => {
    const team = buySeats(base.user.id);

    expect(getTeamForBuyer(base.user.id)?.id).toBe(team.id);
  });

  it("does not treat someone who claimed a Seat as a Buyer", () => {
    const claimer = addStudent("claimer@example.com");
    const team = buySeats(base.user.id, [claimer.id]);
    // Databases seeded before team roles were dropped still list claimers
    // as team members.
    testDb
      .insert(schema.teamMembers)
      .values({ teamId: team.id, userId: claimer.id })
      .run();

    expect(getTeamForBuyer(claimer.id)).toBeUndefined();
  });

  it("finds no team for a Buyer with only an Own Purchase", () => {
    testDb
      .insert(schema.purchases)
      .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 5000 })
      .run();

    expect(getTeamForBuyer(base.user.id)).toBeUndefined();
  });
});

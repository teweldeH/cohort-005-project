import { asc, eq } from "drizzle-orm";
import { db } from "~/db";
import { purchases, seats, teams } from "~/db/schema";

/**
 * The team a Buyer bought Seats for, found through their Team Purchases.
 * Claiming a Seat never makes someone a Buyer, whatever `team_members` says.
 */
export function getTeamForBuyer(userId: number) {
  return db
    .select({ id: teams.id, createdAt: teams.createdAt })
    .from(teams)
    .innerJoin(seats, eq(seats.teamId, teams.id))
    .innerJoin(purchases, eq(seats.purchaseId, purchases.id))
    .where(eq(purchases.userId, userId))
    .orderBy(asc(teams.id))
    .get();
}

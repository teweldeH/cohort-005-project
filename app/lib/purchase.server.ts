import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTransaction } from "~/db";
import {
  enrollments,
  purchases,
  refundRequests,
  RefundRequestStatus,
  seatReleases,
  seats,
  teams,
} from "~/db/schema";
import { calculatePppPrice } from "~/lib/ppp";
import { refuse, type Result } from "~/lib/result";
import { newSeatCode } from "~/lib/seats/codes.server";
import { getTeamForBuyer } from "~/lib/teams.server";

/**
 * Purchase: buying an Own Purchase or a Team Purchase, and the one read of a
 * purchase that every other module uses.
 *
 * The read looks straight at the Seat and Refund Request tables, to count a
 * purchase's Seats and to find its Standing. Seats and Refunds still own
 * every write to those tables; Purchase only reads them.
 */

/** Where a purchase stands with respect to a Refund. See GLOSSARY.md. */
export type Standing = "active" | "paused" | "refunded";

interface PurchaseBase {
  id: number;
  userId: number;
  courseId: number;
  amountPaid: number;
  country: string | null;
  createdAt: string;
  standing: Standing;
  // A purchase has at most one Refund Request that counts: the latest.
  refundRequestStatus: RefundRequestStatus | null;
}

/**
 * A purchase as every module sees it. Its kind is worked out from whether it
 * has Seats, never stored.
 */
export type Purchase =
  | (PurchaseBase & { kind: "own" })
  | (PurchaseBase & {
      kind: "team";
      // Ever claimed counts Seats claimed now and Seats since Released.
      seats: { total: number; claimed: number; everClaimed: number };
    });

/**
 * What a purchase of a course costs from a country: the PPP price per Seat
 * when the course has PPP enabled, times the number of Seats. An Own
 * Purchase is one Seat's worth. The purchase page shows this and `buy`
 * charges it.
 */
export function quote(
  course: { price: number; pppEnabled: boolean },
  country: string | null,
  seats = 1
) {
  const perSeat = course.pppEnabled
    ? calculatePppPrice(course.price, country)
    : course.price;

  return { perSeat, total: perSeat * seats };
}

export type BuyRefusal = "already-enrolled";

/**
 * Buys a course in one transaction, charging what `quote` gives. With no
 * `seats` it is an Own Purchase, which starts the Buyer's Enrollment and so
 * is refused while they are already enrolled. With `seats` it is a Team
 * Purchase of that many Seats on the Buyer's Team, made with their first
 * Team Purchase; the Buyer may already be enrolled.
 */
export function buy({
  buyerId,
  course,
  country,
  seats: seatCount,
}: {
  buyerId: number;
  course: { id: number; price: number; pppEnabled: boolean };
  country: string | null;
  seats?: number;
}): Result<{ purchase: Purchase }, BuyRefusal> {
  return db.transaction((tx) => {
    if (seatCount === undefined && isEnrolled(tx, buyerId, course.id)) {
      return refuse("already-enrolled");
    }

    const { id } = tx
      .insert(purchases)
      .values({
        userId: buyerId,
        courseId: course.id,
        amountPaid: quote(course, country, seatCount).total,
        country,
      })
      .returning({ id: purchases.id })
      .get();

    if (seatCount === undefined) {
      tx.insert(enrollments)
        .values({ userId: buyerId, courseId: course.id })
        .run();
    } else {
      const team =
        getTeamForBuyer(buyerId, tx) ??
        tx.insert(teams).values({}).returning({ id: teams.id }).get();
      tx.insert(seats)
        .values(
          Array.from({ length: seatCount }, () => ({
            teamId: team.id,
            courseId: course.id,
            code: newSeatCode(),
            purchaseId: id,
          }))
        )
        .run();
    }

    return { ok: true, purchase: readPurchase(tx, id) };
  });
}

/**
 * The one read of a purchase, by id. Pass `buyerId` or `courseId` to also
 * require the purchase to be theirs or of that course. Runs inside `tx` when
 * given.
 */
export function getPurchase(
  where: { id: number; buyerId?: number; courseId?: number },
  tx: DbOrTransaction = db
): Purchase | undefined {
  return findPurchase(
    tx,
    and(
      eq(purchases.id, where.id),
      where.buyerId === undefined
        ? undefined
        : eq(purchases.userId, where.buyerId),
      where.courseId === undefined
        ? undefined
        : eq(purchases.courseId, where.courseId)
    )
  );
}

/**
 * A purchase's Standing on its own, for the Seat checks that need nothing
 * else. Runs inside `tx` when given.
 */
export function getStanding(
  purchaseId: number,
  tx: DbOrTransaction = db
): Standing {
  return standingFor(latestRefundRequestStatus(tx, purchaseId));
}

function readPurchase(tx: DbOrTransaction, id: number) {
  const purchase = findPurchase(tx, eq(purchases.id, id));
  if (!purchase) throw new Error(`Purchase ${id} is missing.`);
  return purchase;
}

function findPurchase(
  tx: DbOrTransaction,
  where: SQL | undefined
): Purchase | undefined {
  const row = tx.select().from(purchases).where(where).get();
  if (!row) return undefined;

  const refundRequestStatus = latestRefundRequestStatus(tx, row.id);
  const base: PurchaseBase = {
    id: row.id,
    userId: row.userId,
    courseId: row.courseId,
    amountPaid: row.amountPaid,
    country: row.country,
    createdAt: row.createdAt,
    standing: standingFor(refundRequestStatus),
    refundRequestStatus,
  };

  const seatCounts = countSeats(tx, row.id);
  return seatCounts.total > 0
    ? { ...base, kind: "team", seats: seatCounts }
    : { ...base, kind: "own" };
}

function countSeats(tx: DbOrTransaction, purchaseId: number) {
  const everClaimed = sql`${seats.claimedByUserId} is not null or exists (
    select 1 from ${seatReleases} where ${seatReleases.seatId} = ${seats.id}
  )`;
  const result = tx
    .select({
      total: sql<number>`count(*)`,
      claimed: sql<number>`count(${seats.claimedByUserId})`,
      everClaimed: sql<number>`count(case when ${everClaimed} then 1 end)`,
    })
    .from(seats)
    .where(eq(seats.purchaseId, purchaseId))
    .get();

  return {
    total: result?.total ?? 0,
    claimed: result?.claimed ?? 0,
    everClaimed: result?.everClaimed ?? 0,
  };
}

function latestRefundRequestStatus(tx: DbOrTransaction, purchaseId: number) {
  const request = tx
    .select({ status: refundRequests.status })
    .from(refundRequests)
    .where(eq(refundRequests.purchaseId, purchaseId))
    .orderBy(desc(refundRequests.id))
    .get();

  return request?.status ?? null;
}

/** A Declined Refund Request leaves a purchase active. */
function standingFor(status: RefundRequestStatus | null): Standing {
  if (status === RefundRequestStatus.Requested) return "paused";
  if (status === RefundRequestStatus.Approved) return "refunded";
  return "active";
}

function isEnrolled(tx: DbOrTransaction, userId: number, courseId: number) {
  return !!tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

/**
 * Every purchase a Buyer made of a course, newest first, and `own`: the
 * latest Own Purchase, the one that gave them their own access. A Team
 * Purchase is never `own`.
 */
export function getBuyerPurchases(
  buyerId: number,
  courseId: number,
  tx: DbOrTransaction = db
) {
  const buyerPurchases = tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, buyerId), eq(purchases.courseId, courseId)))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .all()
    .map(({ id }) => readPurchase(tx, id));

  return {
    purchases: buyerPurchases,
    own: buyerPurchases.find((purchase) => purchase.kind === "own"),
  };
}

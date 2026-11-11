export type PurchaseWithSeats = {
  id: number;
  createdAt: string;
  seats: number;
};

/** A Team Purchase buys Seats for other people; an Own Purchase buys none. */
export function isTeamPurchase(purchase: Pick<PurchaseWithSeats, "seats">) {
  return purchase.seats > 0;
}

/**
 * The Buyer's latest Own Purchase of a course: the one that gave them their
 * own access. A Team Purchase is never it.
 */
export function findOwnPurchase<T extends PurchaseWithSeats>(
  purchases: T[]
): T | undefined {
  return purchases
    .filter((purchase) => !isTeamPurchase(purchase))
    .reduce<T | undefined>(
      (latest, purchase) =>
        !latest || purchase.createdAt > latest.createdAt ? purchase : latest,
      undefined
    );
}

import { describe, it, expect } from "vitest";
import { findOwnPurchase } from "./refunds";

describe("findOwnPurchase", () => {
  it("picks the Buyer's Own Purchase over a newer Team Purchase", () => {
    // A Buyer purchases the course for themselves, then buys 5 Seats for their
    // team. The course page is about their own access, so the Team Purchase
    // is not it.
    const own = { id: 1, createdAt: "2026-11-01T10:00:00.000Z", seats: 0 };
    const team = { id: 2, createdAt: "2026-11-03T10:00:00.000Z", seats: 5 };

    expect(findOwnPurchase([own, team])).toBe(own);
  });

  it("picks the latest of the Buyer's Own Purchases, whatever the order", () => {
    const older = { id: 1, createdAt: "2026-10-01T10:00:00.000Z", seats: 0 };
    const newer = { id: 3, createdAt: "2026-11-05T10:00:00.000Z", seats: 0 };

    expect(findOwnPurchase([older, newer])).toBe(newer);
    expect(findOwnPurchase([newer, older])).toBe(newer);
  });

  it("finds nothing when the Buyer only has Team Purchases", () => {
    // Their own access came from a claimed Seat, which nobody paid them for.
    const team = { id: 2, createdAt: "2026-11-03T10:00:00.000Z", seats: 5 };

    expect(findOwnPurchase([team])).toBeUndefined();
    expect(findOwnPurchase([])).toBeUndefined();
  });
});

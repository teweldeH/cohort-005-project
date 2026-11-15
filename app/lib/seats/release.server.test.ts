import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import { getPurchase } from "~/lib/purchase.server";
import { getRefundEligibility } from "~/lib/refunds.server";
import {
  claimSeat,
  getTeamRoster,
  inviteToSeat,
  releaseSeat,
} from "./index.server";
import { progressFixtures } from "./progress-fixtures";
import { seatFixtures } from "./test-fixtures";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

let base: ReturnType<typeof seedBaseData>;
let fixtures: ReturnType<typeof seatFixtures>;
let progress: ReturnType<typeof progressFixtures>;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  fixtures = seatFixtures(testDb, base);
  progress = progressFixtures(testDb, base);
});

function rosterSeats(buyerId = base.user.id) {
  const result = getTeamRoster(buyerId);
  if (!result.ok) throw new Error(`No roster: ${result.reason}`);
  return result.roster.purchases.flatMap((purchase) => purchase.seats);
}

function isEnrolled(userId: number, courseId = base.course.id) {
  return !!testDb
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, courseId)
      )
    )
    .get();
}

/** A Team Purchase whose first Seat `holder` has claimed through its link. */
function claimedSeat(holderEmail = "holder@example.com") {
  const holder = fixtures.addStudent(holderEmail, "Hal Holder");
  const { seats, purchase } = fixtures.buyTeamPurchase();
  const claimed = claimSeat("SEAT-1", holder.id, "US");
  if (!claimed.ok) throw new Error(`Claim refused: ${claimed.reason}`);
  return { holder, seat: seats[0], purchase };
}

describe("releaseSeat", () => {
  it("ends the holder's Enrollment and leaves the Seat open with a new code", () => {
    const { holder, seat } = claimedSeat();

    const result = releaseSeat(base.user.id, seat.id);

    expect(result.ok).toBe(true);
    expect(isEnrolled(holder.id)).toBe(false);
    const [released] = rosterSeats();
    expect(released.status).toBe("open");
    expect(released.code).not.toBe("SEAT-1");
  });

  it("stops the former holder's old link from working", () => {
    const { holder, seat } = claimedSeat();

    releaseSeat(base.user.id, seat.id);

    expect(claimSeat("SEAT-1", holder.id, "US")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("can Release the same Seat again after someone else claims it", () => {
    const { seat } = claimedSeat();
    releaseSeat(base.user.id, seat.id);
    const next = fixtures.addStudent("next@example.com");
    claimSeat(rosterSeats()[0].code, next.id, "US");

    expect(releaseSeat(base.user.id, seat.id).ok).toBe(true);
  });

  it("refuses an open Seat", () => {
    const { seats } = fixtures.buyTeamPurchase();

    expect(releaseSeat(base.user.id, seats[0].id)).toEqual({
      ok: false,
      reason: "not-claimed",
    });
  });

  it("refuses anyone but the Buyer, the holder included", () => {
    const { holder, seat } = claimedSeat();

    expect(releaseSeat(holder.id, seat.id)).toEqual({
      ok: false,
      reason: "not-buyer",
    });
    expect(isEnrolled(holder.id)).toBe(true);
  });

  it("keeps an Enrollment the holder's own purchase gives", () => {
    const { holder, seat } = claimedSeat();
    testDb
      .insert(schema.purchases)
      .values({ userId: holder.id, courseId: base.course.id, amountPaid: 4900 })
      .run();

    releaseSeat(base.user.id, seat.id);

    expect(isEnrolled(holder.id)).toBe(true);
  });

  it("refuses once the holder has completed half the lessons", () => {
    const lessons = progress.addLessons(4);
    const { holder, seat } = claimedSeat();
    progress.completeLesson(holder.id, lessons[0].id, "2026-11-01T10:00:00Z");
    progress.completeLesson(holder.id, lessons[1].id, "2026-11-01T11:00:00Z");

    expect(releaseSeat(base.user.id, seat.id)).toEqual({
      ok: false,
      reason: "past-release-limit",
    });
    expect(isEnrolled(holder.id)).toBe(true);
  });

  it("allows a Release just under half the lessons", () => {
    const lessons = progress.addLessons(4);
    const { holder, seat } = claimedSeat();
    progress.completeLesson(holder.id, lessons[0].id, "2026-11-01T10:00:00Z");

    expect(releaseSeat(base.user.id, seat.id).ok).toBe(true);
  });

  it("refuses once the holder has watched 2 hours", () => {
    const lessons = progress.addLessons(4);
    const { holder, seat } = claimedSeat();
    progress.watchVideo(holder.id, lessons[0].id, "2026-11-01T10:00:00Z", 3600);
    progress.watchVideo(holder.id, lessons[1].id, "2026-11-01T11:00:00Z", 3600);

    expect(releaseSeat(base.user.id, seat.id)).toEqual({
      ok: false,
      reason: "past-release-limit",
    });
  });

  it("counts dormant Progress from before the Seat towards the limit", () => {
    const lessons = progress.addLessons(4);
    const holder = fixtures.addStudent("holder@example.com");
    progress.completeLesson(holder.id, lessons[0].id, "2026-10-01T10:00:00Z");
    progress.completeLesson(holder.id, lessons[1].id, "2026-10-01T11:00:00Z");
    const { seats } = fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");

    expect(releaseSeat(base.user.id, seats[0].id)).toEqual({
      ok: false,
      reason: "past-release-limit",
    });
  });

  it("keeps the Team Purchase ineligible for a Refund", () => {
    const { seat, purchase } = claimedSeat();

    releaseSeat(base.user.id, seat.id);

    const read = getPurchase({ id: purchase.id });
    expect(read && getRefundEligibility(read)).toEqual({ eligible: false, reason: "seat-claimed" });
  });

  it("shows the roster which claimed Seats can be Released", () => {
    const lessons = progress.addLessons(2);
    const within = fixtures.addStudent("within@example.com");
    const past = fixtures.addStudent("past@example.com");
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", within.id, "US");
    claimSeat("SEAT-2", past.id, "US");
    progress.completeLesson(past.id, lessons[0].id, "2026-11-01T10:00:00Z");

    expect(rosterSeats()).toMatchObject([
      { status: "claimed", releasable: true, releaseBlockedReason: null },
      {
        status: "claimed",
        releasable: false,
        releaseBlockedReason: "past-release-limit",
      },
    ]);
  });

  it("brings earlier Progress back when the former holder is invited again", () => {
    const lessons = progress.addLessons(4);
    const { holder, seat } = claimedSeat();
    progress.completeLesson(holder.id, lessons[0].id, "2026-11-01T10:00:00Z");
    releaseSeat(base.user.id, seat.id);

    const invited = inviteToSeat(base.user.id, seat.id, holder.email);
    if (!invited.ok) throw new Error(`Invite refused: ${invited.reason}`);
    claimSeat(invited.seat.code, holder.id, "US");

    expect(rosterSeats()[0]).toMatchObject({
      status: "claimed",
      holder: { id: holder.id },
      progress: { percent: 25 },
    });
  });
});

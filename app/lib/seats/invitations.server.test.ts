import { describe, it, expect, beforeEach, vi } from "vitest";
import { RefundRequestStatus } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  claimSeat,
  getTeamRoster,
  inviteToSeat,
  withdrawInvitation,
} from "./index.server";
import { seatFixtures } from "./test-fixtures";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

let base: ReturnType<typeof seedBaseData>;
let fixtures: ReturnType<typeof seatFixtures>;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  fixtures = seatFixtures(testDb, base);
});

function rosterSeats(buyerId = base.user.id) {
  const result = getTeamRoster(buyerId);
  if (!result.ok) throw new Error(`No roster: ${result.reason}`);
  return result.roster.purchases.flatMap((purchase) => purchase.seats);
}

/** Invites `email` to a Seat and returns the Invitation's new code. */
function invite(seatId: number, email: string, buyerId = base.user.id) {
  const result = inviteToSeat(buyerId, seatId, email);
  if (!result.ok) throw new Error(`Invite refused: ${result.reason}`);
  return result.seat.code;
}

describe("inviteToSeat", () => {
  it("lets only the invited email claim the Seat, in any letter case", () => {
    const invitee = fixtures.addStudent("ivy@example.com", "Ivy Invitee");
    const { seats } = fixtures.buyTeamPurchase();

    const code = invite(seats[0].id, "Ivy@Example.COM");

    expect(claimSeat(code, invitee.id, "US").ok).toBe(true);
    expect(rosterSeats()[0]).toMatchObject({
      status: "claimed",
      holder: { id: invitee.id, email: "ivy@example.com" },
    });
  });

  it("refuses a claim from an account with a different email", () => {
    fixtures.addStudent("ivy@example.com");
    const other = fixtures.addStudent("other@example.com");
    const { seats } = fixtures.buyTeamPurchase();

    const code = invite(seats[0].id, "ivy@example.com");

    expect(claimSeat(code, other.id, "US")).toEqual({
      ok: false,
      reason: "not-invited-email",
    });
    expect(rosterSeats()[0]).toMatchObject({ status: "invited" });
  });

  it("gives the Seat a new code, so its old open link stops working", () => {
    const invitee = fixtures.addStudent("ivy@example.com");
    const { seats } = fixtures.buyTeamPurchase();

    const code = invite(seats[0].id, "ivy@example.com");

    expect(code).not.toBe("SEAT-1");
    expect(claimSeat("SEAT-1", invitee.id, "US")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("shows the invited row with the invitee's email, when they were invited and the new code", () => {
    const { seats } = fixtures.buyTeamPurchase();

    const code = invite(seats[0].id, "Ivy@Example.com");

    expect(rosterSeats()[0]).toEqual({
      id: seats[0].id,
      code,
      status: "invited",
      invitedEmail: "ivy@example.com",
      invitedAt: expect.any(String),
    });
  });

  it("allows the Buyer to invite themselves", () => {
    const { seats } = fixtures.buyTeamPurchase();

    const code = invite(seats[0].id, base.user.email);

    expect(claimSeat(code, base.user.id, "US").ok).toBe(true);
  });

  it("refuses an email that already holds an Invitation for the course on this Team", () => {
    const { seats } = fixtures.buyTeamPurchase({ seats: 3 });
    invite(seats[0].id, "ivy@example.com");

    expect(inviteToSeat(base.user.id, seats[1].id, "IVY@example.com")).toEqual({
      ok: false,
      reason: "duplicate-invitation",
    });
  });

  it("refuses the email of someone holding a Seat for the course on this Team", () => {
    const holder = fixtures.addStudent("holly@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");

    expect(inviteToSeat(base.user.id, seats[1].id, "Holly@example.com")).toEqual({
      ok: false,
      reason: "duplicate-invitation",
    });
  });

  it("allows the same email on another course's Seat on this Team", () => {
    const otherCourse = fixtures.addCourse("other-course");
    const { seats } = fixtures.buyTeamPurchase();
    const { seats: otherSeats } = fixtures.buyTeamPurchase({
      courseId: otherCourse.id,
      prefix: "OTHER",
    });
    invite(seats[0].id, "ivy@example.com");

    expect(inviteToSeat(base.user.id, otherSeats[0].id, "ivy@example.com").ok).toBe(
      true
    );
  });

  it("refuses anyone but the Buyer, leaving the Seat's link working", () => {
    const stranger = fixtures.addStudent("stranger@example.com");
    const claimer = fixtures.addStudent("claimer@example.com");
    const { seats } = fixtures.buyTeamPurchase();

    expect(inviteToSeat(stranger.id, seats[0].id, "ivy@example.com")).toEqual({
      ok: false,
      reason: "not-buyer",
    });
    expect(claimSeat("SEAT-1", claimer.id, "US").ok).toBe(true);
  });

  it("refuses a Seat that is already claimed or invited", () => {
    const holder = fixtures.addStudent("holly@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");
    invite(seats[1].id, "ivy@example.com");

    expect(inviteToSeat(base.user.id, seats[0].id, "new@example.com")).toEqual({
      ok: false,
      reason: "not-open",
    });
    expect(inviteToSeat(base.user.id, seats[1].id, "new@example.com")).toEqual({
      ok: false,
      reason: "not-open",
    });
  });

  it("refuses while a Refund Request waits on a decision, and once refunded", () => {
    const { purchase: paused, seats: pausedSeats } = fixtures.buyTeamPurchase();
    fixtures.addRefundRequest(paused.id, RefundRequestStatus.Requested);
    const { purchase: refunded, seats: refundedSeats } =
      fixtures.buyTeamPurchase({ prefix: "GONE" });
    fixtures.addRefundRequest(refunded.id, RefundRequestStatus.Approved);

    expect(inviteToSeat(base.user.id, pausedSeats[0].id, "ivy@example.com")).toEqual({
      ok: false,
      reason: "paused",
    });
    expect(
      inviteToSeat(base.user.id, refundedSeats[0].id, "ivy@example.com")
    ).toEqual({ ok: false, reason: "refunded" });
  });
});

describe("withdrawInvitation", () => {
  it("puts the Seat back to open with a new code, so the Invitation's link stops working", () => {
    const invitee = fixtures.addStudent("ivy@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const invitedCode = invite(seats[0].id, "ivy@example.com");

    const result = withdrawInvitation(base.user.id, seats[0].id);
    if (!result.ok) throw new Error(`Withdraw refused: ${result.reason}`);

    expect(result.seat.code).not.toBe(invitedCode);
    expect(rosterSeats()[0]).toEqual({
      id: seats[0].id,
      code: result.seat.code,
      status: "open",
    });
    expect(claimSeat(invitedCode, invitee.id, "US")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("lets the email be invited again afterwards", () => {
    const { seats } = fixtures.buyTeamPurchase();
    invite(seats[0].id, "ivy@example.com");
    withdrawInvitation(base.user.id, seats[0].id);

    expect(inviteToSeat(base.user.id, seats[1].id, "ivy@example.com").ok).toBe(
      true
    );
  });

  it("refuses anyone but the Buyer, leaving the Invitation in place", () => {
    const stranger = fixtures.addStudent("stranger@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    invite(seats[0].id, "ivy@example.com");

    expect(withdrawInvitation(stranger.id, seats[0].id)).toEqual({
      ok: false,
      reason: "not-buyer",
    });
    expect(rosterSeats()[0]).toMatchObject({ status: "invited" });
  });

  it("refuses a Seat with no Invitation", () => {
    const { seats } = fixtures.buyTeamPurchase();

    expect(withdrawInvitation(base.user.id, seats[0].id)).toEqual({
      ok: false,
      reason: "not-invited",
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RefundRequestStatus } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  decideRefundRequest,
  getRefundEligibility,
} from "~/lib/refunds.server";
import {
  claimSeat,
  getClaimView,
  getTeamRoster,
  inviteToSeat,
  turnDownInvitation,
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

function rosterSeats() {
  const result = getTeamRoster(base.user.id);
  if (!result.ok) throw new Error(`No roster: ${result.reason}`);
  return result.roster.purchases.flatMap((purchase) => purchase.seats);
}

/** Invites `email` to a Seat and returns the Invitation's new code. */
function invite(seatId: number, email: string) {
  const result = inviteToSeat(base.user.id, seatId, email);
  if (!result.ok) throw new Error(`Invite refused: ${result.reason}`);
  return result.seat.code;
}

describe("while a Refund Request is Requested", () => {
  it("refuses to withdraw an Invitation", () => {
    const { purchase, seats } = fixtures.buyTeamPurchase();
    invite(seats[0].id, "ivy@example.com");
    fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Requested);

    expect(withdrawInvitation(base.user.id, seats[0].id)).toEqual({
      ok: false,
      reason: "paused",
    });
  });

  it("shows invited Seats as invited-paused, keeping the invitee", () => {
    fixtures.addStudent("ivy@example.com");
    const { purchase, seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");
    fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Requested);

    expect(rosterSeats()).toMatchObject([
      { status: "invited-paused", code, invitedEmail: "ivy@example.com" },
      { status: "open" },
    ]);
  });

  it("refuses the invitee's claim, and the claim page shows the Seat paused", () => {
    const invitee = fixtures.addStudent("ivy@example.com");
    const { purchase, seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");
    fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Requested);

    expect(claimSeat(code, invitee.id, "US")).toEqual({
      ok: false,
      reason: "paused",
    });
    expect(
      getClaimView(code, { userId: invitee.id, country: "US" })
    ).toMatchObject({ ok: true, view: { paused: true } });
  });
});

/** A Requested Refund Request on a Team Purchase with one invited Seat. */
function pausedPurchaseWithInvitation() {
  const invitee = fixtures.addStudent("ivy@example.com");
  const { purchase, seats } = fixtures.buyTeamPurchase();
  const code = invite(seats[0].id, "ivy@example.com");
  const request = fixtures.addRefundRequest(
    purchase.id,
    RefundRequestStatus.Requested
  );
  return { invitee, purchase, code, request };
}

describe("Approving the Refund Request", () => {
  it("withdraws its Invitations, so the old link is no longer available", () => {
    const { invitee, purchase, code, request } = pausedPurchaseWithInvitation();

    expect(
      decideRefundRequest(
        request.id,
        purchase,
        { outcome: "approve", note: null },
        base.instructor.id
      )
    ).toBe(true);

    expect(
      getClaimView(code, { userId: invitee.id, country: "US" })
    ).toEqual({ ok: false, reason: "not-found" });
    expect(claimSeat(code, invitee.id, "US")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(rosterSeats().map((seat) => seat.status)).toEqual([
      "refunded",
      "refunded",
    ]);
  });
});

describe("Declining the Refund Request", () => {
  it("resumes an Invitation the invitee tried to Turn down while paused", () => {
    const { invitee, purchase, code, request } = pausedPurchaseWithInvitation();

    expect(turnDownInvitation(code, invitee.id)).toEqual({
      ok: false,
      reason: "paused",
    });

    decideRefundRequest(
      request.id,
      purchase,
      { outcome: "decline", note: "Seats were used" },
      base.instructor.id
    );

    expect(rosterSeats()[0]).toMatchObject({
      status: "invited",
      code,
      invitedEmail: "ivy@example.com",
    });
  });


  it("resumes its Invitations unchanged: the invitee claims with the same link", () => {
    const { invitee, purchase, code, request } = pausedPurchaseWithInvitation();

    decideRefundRequest(
      request.id,
      purchase,
      { outcome: "decline", note: "Seats were used" },
      base.instructor.id
    );

    expect(rosterSeats()[0]).toMatchObject({
      status: "invited",
      code,
      invitedEmail: "ivy@example.com",
    });
    expect(claimSeat(code, invitee.id, "US").ok).toBe(true);
  });
});

describe("Refund Eligibility", () => {
  it("still allows a Refund for a Team Purchase with only Invitations", () => {
    const { purchase, seats } = fixtures.buyTeamPurchase();
    invite(seats[0].id, "ivy@example.com");
    invite(seats[1].id, "max@example.com");

    expect(
      getRefundEligibility(purchase, base.user.id, purchase.courseId)
    ).toMatchObject({ eligible: true });
  });
});

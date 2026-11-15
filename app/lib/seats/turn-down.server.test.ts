import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  claimSeat,
  getClaimSignIn,
  getClaimView,
  getTeamRoster,
  inviteToSeat,
  turnDownInvitation,
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

function invite(seatId: number, email: string) {
  const result = inviteToSeat(base.user.id, seatId, email);
  if (!result.ok) throw new Error(`Invite refused: ${result.reason}`);
  return result.seat.code;
}

describe("turnDownInvitation", () => {
  it("gives the Buyer the Seat back as open with a new code", () => {
    const invitee = fixtures.addStudent("ivy@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");

    const result = turnDownInvitation(code, invitee.id);

    expect(result.ok).toBe(true);
    const [seat] = rosterSeats();
    expect(seat).toMatchObject({ status: "open" });
    expect(seat.code).not.toBe(code);
  });

  it("stops the Invitation's link working", () => {
    const invitee = fixtures.addStudent("ivy@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");

    turnDownInvitation(code, invitee.id);

    expect(getClaimView(code, { userId: invitee.id, country: "US" })).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(claimSeat(code, invitee.id, "US")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("lets the invitee Turn down whatever the letter case of their email", () => {
    const invitee = fixtures.addStudent("Ivy@Example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");

    expect(turnDownInvitation(code, invitee.id).ok).toBe(true);
  });

  it("refuses anyone but the invitee", () => {
    fixtures.addStudent("ivy@example.com");
    const other = fixtures.addStudent("other@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");

    expect(turnDownInvitation(code, other.id)).toEqual({
      ok: false,
      reason: "not-invitee",
    });
    expect(turnDownInvitation(code, base.user.id)).toEqual({
      ok: false,
      reason: "not-invitee",
    });
    expect(rosterSeats()[0]).toMatchObject({
      status: "invited",
      code,
      invitedEmail: "ivy@example.com",
    });
  });

  it("refuses on an open Seat, which has no Invitation to Turn down", () => {
    const visitor = fixtures.addStudent("visitor@example.com");
    fixtures.buyTeamPurchase();

    expect(turnDownInvitation("SEAT-1", visitor.id)).toEqual({
      ok: false,
      reason: "not-invitee",
    });
    expect(rosterSeats()[0]).toMatchObject({ status: "open", code: "SEAT-1" });
  });

  it("refuses on a Seat the invitee has already claimed", () => {
    const invitee = fixtures.addStudent("ivy@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");
    claimSeat(code, invitee.id, "US");

    expect(turnDownInvitation(code, invitee.id)).toEqual({
      ok: false,
      reason: "not-invitee",
    });
    expect(rosterSeats()[0]).toMatchObject({ status: "claimed" });
  });

  it("finds nothing for an unknown code", () => {
    const visitor = fixtures.addStudent("visitor@example.com");

    expect(turnDownInvitation("NO-SUCH-SEAT", visitor.id)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("claim view for an invitee", () => {
  function viewFor(code: string, userId: number, country: string | null = "US") {
    const result = getClaimView(code, { userId, country });
    if (!result.ok) throw new Error(`No claim view: ${result.reason}`);
    return result.view;
  }

  it("tells an invitee who already has the course, and lets them Turn down", () => {
    const invitee = fixtures.addStudent("ivy@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");
    fixtures.enroll(invitee.id);

    expect(viewFor(code, invitee.id)).toMatchObject({
      alreadyEnrolled: true,
      invitation: { forViewer: true },
    });
    expect(turnDownInvitation(code, invitee.id).ok).toBe(true);
  });

  it("tells the Buyer nothing about an invitee who already has the course", () => {
    const invitee = fixtures.addStudent("ivy@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");
    const before = rosterSeats();
    fixtures.enroll(invitee.id);

    viewFor(code, invitee.id);

    expect(rosterSeats()).toEqual(before);
  });

  it("explains a country mismatch to the invitee, who may still Turn down", () => {
    const invitee = fixtures.addStudent("ivy@example.com");
    const { seats } = fixtures.buyTeamPurchase({ country: "US" });
    const code = invite(seats[0].id, "ivy@example.com");

    expect(viewFor(code, invitee.id, "DE")).toMatchObject({
      countryMismatch: true,
      buyerCountry: "US",
      invitation: { forViewer: true },
    });
    expect(claimSeat(code, invitee.id, "DE")).toEqual({
      ok: false,
      reason: "country-mismatch",
    });
    expect(turnDownInvitation(code, invitee.id).ok).toBe(true);
  });
});

describe("getClaimSignIn", () => {
  it("names the invited email so sign-up can be filled in", () => {
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "Ivy@Example.com");

    expect(getClaimSignIn(code)).toEqual({
      ok: true,
      invitedEmail: "ivy@example.com",
    });
  });

  it("names no email for an open Seat", () => {
    fixtures.buyTeamPurchase();

    expect(getClaimSignIn("SEAT-1")).toEqual({ ok: true, invitedEmail: null });
  });

  it("finds nothing for a code that no longer exists", () => {
    expect(getClaimSignIn("NO-SUCH-SEAT")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

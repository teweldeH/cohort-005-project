import { describe, it, expect, beforeEach, vi } from "vitest";
import { RefundRequestStatus } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  claimSeat,
  getClaimView,
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

const claimable = {
  invitation: null,
  alreadyClaimed: false,
  alreadyEnrolled: false,
  paused: false,
  refunded: false,
  countryMismatch: false,
  buyerCountry: "US",
};

describe("getClaimView", () => {
  it("shows an open Seat's course as claimable", () => {
    const viewer = fixtures.addStudent("viewer@example.com");
    fixtures.buyTeamPurchase();

    expect(getClaimView("SEAT-1", { userId: viewer.id, country: "US" })).toEqual({
      ok: true,
      view: {
        course: { id: base.course.id, title: "Test Course", slug: "test-course" },
        code: "SEAT-1",
        buyerName: "Test User",
        ...claimable,
      },
    });
  });

  function viewFor(code: string, userId: number, country: string | null = "US") {
    const result = getClaimView(code, { userId, country });
    if (!result.ok) throw new Error(`No claim view: ${result.reason}`);
    return result.view;
  }

  it("shows a Seat someone has claimed as already claimed", () => {
    const holder = fixtures.addStudent("holder@example.com");
    const viewer = fixtures.addStudent("viewer@example.com");
    fixtures.buyTeamPurchase();
    claimSeat("SEAT-1", holder.id, "US");

    expect(viewFor("SEAT-1", viewer.id)).toMatchObject({
      ...claimable,
      alreadyClaimed: true,
    });
  });

  it("shows a Seat as paused while the Buyer's Refund Request is waiting", () => {
    const viewer = fixtures.addStudent("viewer@example.com");
    const { purchase } = fixtures.buyTeamPurchase();
    fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Requested);

    expect(viewFor("SEAT-1", viewer.id)).toMatchObject({
      ...claimable,
      paused: true,
    });
  });

  it("shows a Seat of a refunded Team Purchase as refunded", () => {
    const viewer = fixtures.addStudent("viewer@example.com");
    const { purchase } = fixtures.buyTeamPurchase();
    fixtures.addRefundRequest(purchase.id, RefundRequestStatus.Approved);

    expect(viewFor("SEAT-1", viewer.id)).toMatchObject({
      ...claimable,
      refunded: true,
    });
  });

  it("tells a viewer already enrolled in the course, without a region check", () => {
    const viewer = fixtures.addStudent("viewer@example.com");
    fixtures.buyTeamPurchase({ country: "US" });
    fixtures.enroll(viewer.id);

    expect(viewFor("SEAT-1", viewer.id, "DE")).toMatchObject({
      ...claimable,
      alreadyEnrolled: true,
    });
  });

  it("warns a viewer outside the Buyer's country", () => {
    const viewer = fixtures.addStudent("viewer@example.com");
    fixtures.buyTeamPurchase({ country: "US" });

    expect(viewFor("SEAT-1", viewer.id, "DE")).toMatchObject({
      ...claimable,
      countryMismatch: true,
    });
  });

  function invite(seatId: number, email: string) {
    const result = inviteToSeat(base.user.id, seatId, email);
    if (!result.ok) throw new Error(`Invite refused: ${result.reason}`);
    return result.seat.code;
  }

  it("shows the invitee their Invitation, whatever the letter case of their email", () => {
    const invitee = fixtures.addStudent("Ivy@Example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.COM");

    expect(viewFor(code, invitee.id)).toEqual({
      course: { id: base.course.id, title: "Test Course", slug: "test-course" },
      code,
      buyerName: "Test User",
      ...claimable,
      invitation: { forViewer: true },
    });
  });

  it("tells anyone else the Invitation is for a different address", () => {
    fixtures.addStudent("ivy@example.com");
    const other = fixtures.addStudent("other@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");

    expect(viewFor(code, other.id)).toMatchObject({
      ...claimable,
      invitation: { forViewer: false },
    });
  });

  it("finds no Seat for a link whose Invitation was withdrawn", () => {
    const invitee = fixtures.addStudent("ivy@example.com");
    const { seats } = fixtures.buyTeamPurchase();
    const code = invite(seats[0].id, "ivy@example.com");
    withdrawInvitation(base.user.id, seats[0].id);

    expect(getClaimView(code, { userId: invitee.id, country: "US" })).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("finds no Seat for an unknown code, even for a signed-out visitor", () => {
    fixtures.buyTeamPurchase();

    expect(getClaimView("NO-SUCH-SEAT", null)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("asks a signed-out visitor to sign in to a real Seat", () => {
    fixtures.buyTeamPurchase();

    expect(getClaimView("SEAT-1", null)).toEqual({
      ok: false,
      reason: "signed-out",
    });
  });
});

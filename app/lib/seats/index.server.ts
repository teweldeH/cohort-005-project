/**
 * Seat management: every Seat rule lives behind this module. The Team, claim
 * and course routes call these operations and never query Seats themselves.
 */
export type { SeatResult } from "./result";
export {
  getClaimView,
  type ClaimView,
  type ClaimViewer,
  type ClaimViewRefusal,
} from "./claim-view.server";
export { claimSeat, type ClaimRefusal } from "./claim.server";
export {
  getTeamRoster,
  type TeamRoster,
  type TeamRosterRefusal,
  type RosterPurchase,
  type RosterBanner,
  type RosterSeat,
  type RosterSeatStatus,
  type SeatHolder,
} from "./roster.server";

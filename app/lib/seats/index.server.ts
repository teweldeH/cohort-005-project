/**
 * Seat management: every Seat rule lives behind this module. The Team, claim
 * and course routes call these operations and never query Seats themselves.
 */
export type { SeatResult } from "./result";
export {
  getClaimView,
  type ClaimView,
  type ClaimInvitation,
  type ClaimViewer,
  type ClaimViewRefusal,
} from "./claim-view.server";
export { getClaimSignIn } from "./claim-sign-in.server";
export { claimSeat, type ClaimRefusal } from "./claim.server";
export { newSeatCode } from "./codes.server";
export {
  inviteToSeat,
  withdrawInvitation,
  type InviteRefusal,
  type WithdrawRefusal,
} from "./invitations.server";
export { turnDownInvitation, type TurnDownRefusal } from "./turn-down.server";
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
export {
  getStudentCourseNotices,
  type StudentCourseNotice,
} from "./notices.server";
export type { SeatProgress } from "./progress.server";

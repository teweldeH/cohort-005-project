// PROTOTYPE — Seat management v1 Team page (#53). Throwaway.
import { useState } from "react";
import { RefundRequestStatus } from "~/db/schema";

export type ProtoHolder = {
  name: string;
  email: string;
  percent: number;
  finished: boolean;
  lastActive: string | null;
  releasable: boolean;
};

export type ProtoSeat =
  | { id: number; code: string; state: "refunded" }
  | { id: number; code: string; state: "open" }
  | {
      id: number;
      code: string;
      state: "invited";
      invitee: { email: string; sentAt: string };
    }
  | {
      id: number;
      code: string;
      state: "claimed";
      claimedAt: string | null;
      holder: ProtoHolder;
    };

export type ProtoPurchase = {
  id: number;
  courseTitle: string;
  courseSlug: string;
  purchasedAt: string;
  amount: number;
  refundStatus: RefundRequestStatus | null;
  // Refund Eligibility for a Team Purchase ends at the first claim, ever.
  everClaimed: boolean;
  seats: ProtoSeat[];
};

/** While a Refund Request is Requested, Invitations pause and nothing new can be offered. */
export function isPaused(p: ProtoPurchase) {
  return p.refundStatus === RefundRequestStatus.Requested;
}

export function isRefunded(p: ProtoPurchase) {
  return p.refundStatus === RefundRequestStatus.Approved;
}

/** The first claim ends Refund Eligibility: warn before offering a Seat. */
export function warnsOnFirstClaim(p: ProtoPurchase) {
  return !p.everClaimed && p.refundStatus === null;
}

export const RELEASE_LIMIT_REASON = "Past the Release limit";

export function ago(iso: string | null) {
  if (!iso) return "Never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

function newCode() {
  return "NEW-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * In-memory stand-in for the real actions. Nothing is saved: every action
 * rewrites local state and logs what the real system would do.
 */
export function useMockTeam(initial: ProtoPurchase[]) {
  const [purchases, setPurchases] = useState(initial);
  const [log, setLog] = useState<string[]>([]);

  function updateSeat(seatId: number, fn: (s: ProtoSeat) => ProtoSeat) {
    setPurchases((ps) =>
      ps.map((p) => ({
        ...p,
        seats: p.seats.map((s) => (s.id === seatId ? fn(s) : s)),
      }))
    );
  }
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 6));

  return {
    purchases,
    log,
    invite(seatId: number, email: string) {
      updateSeat(seatId, (s) => ({
        id: s.id,
        code: newCode(),
        state: "invited",
        invitee: { email, sentAt: new Date().toISOString() },
      }));
      note(`Invited ${email}: new code, Invitation email to the outbox`);
    },
    withdraw(seatId: number, email: string) {
      updateSeat(seatId, (s) => ({ id: s.id, code: newCode(), state: "open" }));
      note(`Withdrew ${email}'s Invitation: new code, invitee not told`);
    },
    resend(email: string) {
      note(`Resent the Invitation email to ${email}`);
    },
    release(seatId: number, holder: ProtoHolder) {
      updateSeat(seatId, (s) => ({ id: s.id, code: newCode(), state: "open" }));
      note(
        `Released ${holder.name}: Enrollment ended, progress kept dormant, seat_released Notification (emailed)`
      );
    },
    copied(code: string) {
      note(`Copied claim link /claim/${code}`);
    },
  };
}

export type MockTeam = ReturnType<typeof useMockTeam>;

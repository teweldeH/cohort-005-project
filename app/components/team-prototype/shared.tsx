// PROTOTYPE — Seat management v1 Team page (#53). Throwaway.
// Small pieces the variants share; each variant owns its own layout.
import { useState } from "react";
import { Check, Copy, AlertTriangle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { MockTeam, ProtoPurchase, ProtoSeat } from "./types";
import { isPaused, isRefunded, warnsOnFirstClaim } from "./types";

export function ProgressBar({ percent, finished }: { percent: number; finished: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full", finished ? "bg-green-600" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {finished ? "Finished" : `${percent}%`}
      </span>
    </div>
  );
}

const CHIP: Record<ProtoSeat["state"] | "paused", string> = {
  claimed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  invited: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  open: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  refunded: "bg-muted text-muted-foreground",
  paused: "bg-muted text-muted-foreground",
};

export function StatusChip({ seat, paused }: { seat: ProtoSeat; paused?: boolean }) {
  const label =
    paused && seat.state === "invited"
      ? "Invited · paused"
      : { claimed: "Claimed", invited: "Invited", open: "Open", refunded: "Refunded" }[
          seat.state
        ];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        CHIP[paused && seat.state !== "claimed" ? "paused" : seat.state]
      )}
    >
      {label}
    </span>
  );
}

export function CopyLink({ code, team }: { code: string; team: MockTeam }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(`${window.location.origin}/claim/${code}`);
        team.copied(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function InviteForm({
  seatId,
  team,
  compact,
}: {
  seatId: number;
  team: MockTeam;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.includes("@")) return;
        team.invite(seatId, email);
        setEmail("");
      }}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@company.com"
        className={cn(
          "rounded-md border border-input bg-background px-2 py-1 text-sm",
          compact ? "w-44" : "w-60"
        )}
      />
      <Button type="submit" size="sm" variant="outline">
        Invite
      </Button>
    </form>
  );
}

/** Banners for the purchase-wide states that change what the Buyer can do. */
export function PurchaseNotice({ purchase }: { purchase: ProtoPurchase }) {
  if (isRefunded(purchase))
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Refunded. Its Seats can no longer be claimed.
      </p>
    );
  if (isPaused(purchase))
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Refund requested. Invitations are paused and no Seat can be claimed or offered
        until we've reviewed it. If it's declined, they resume.
      </p>
    );
  if (warnsOnFirstClaim(purchase))
    return (
      <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        You can still get a Refund for this purchase. Once anyone claims one of its
        Seats, you can't — even if you later Release them.
      </p>
    );
  return null;
}

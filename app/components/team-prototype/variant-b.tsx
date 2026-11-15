// PROTOTYPE — Variant B: a board per purchase with three columns (Learning,
// Invited, Open). Open Seats collapse into one "invite someone" box instead of
// a row each; the first-claim warning is a confirm step inside it. Throwaway.
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { formatPrice } from "~/lib/utils";
import {
  ago,
  isPaused,
  isRefunded,
  RELEASE_LIMIT_REASON,
  warnsOnFirstClaim,
  type MockTeam,
  type ProtoPurchase,
} from "./types";
import { CopyLink, ProgressBar, PurchaseNotice } from "./shared";

function OpenSeatsBox({ p, team }: { p: ProtoPurchase; team: MockTeam }) {
  const open = p.seats.filter((s) => s.state === "open");
  const [email, setEmail] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const blocked = isPaused(p) || isRefunded(p);
  const needsAck = warnsOnFirstClaim(p) && !acknowledged;

  return (
    <div className="rounded-lg border border-dashed p-4">
      <p className="text-2xl font-bold">{open.length}</p>
      <p className="mb-3 text-xs text-muted-foreground">open Seats</p>
      {blocked || open.length === 0 ? null : (
        <>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.includes("@") || needsAck) return;
              team.invite(open[0].id, email);
              setEmail("");
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Invite by email"
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
            {warnsOnFirstClaim(p) && (
              <label className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                I understand that once anyone claims a Seat, this purchase can't be
                refunded.
              </label>
            )}
            <Button type="submit" size="sm" className="w-full" disabled={needsAck}>
              Send Invitation
            </Button>
          </form>
          <button
            onClick={() => setShowLinks((s) => !s)}
            className="mt-3 text-xs text-muted-foreground underline"
          >
            {showLinks ? "Hide" : "Or share a"} claim link
          </button>
          {showLinks && (
            <ul className="mt-2 space-y-1">
              {open.map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <code className="text-xs">{s.code}</code>
                  <CopyLink code={s.code} team={team} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function VariantB({ team }: { team: MockTeam }) {
  return (
    <div className="space-y-12">
      {team.purchases.map((p) => {
        const paused = isPaused(p);
        const claimed = p.seats.filter((s) => s.state === "claimed");
        const invited = p.seats.filter((s) => s.state === "invited");
        return (
          <section key={p.id}>
            <h2 className="text-lg font-semibold">{p.courseTitle}</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {p.seats.length} Seats · {formatPrice(p.amount)} · bought{" "}
              {new Date(p.purchasedAt).toLocaleDateString()}
            </p>
            <div className="mb-4">
              <PurchaseNotice purchase={p} />
            </div>
            <div className="grid gap-6 md:grid-cols-[2fr_1fr_1fr]">
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  Learning ({claimed.length})
                </h3>
                <div className="space-y-2">
                  {claimed.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nobody yet.</p>
                  )}
                  {claimed.map(
                    (seat) =>
                      seat.state === "claimed" && (
                        <div key={seat.id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{seat.holder.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Active {ago(seat.holder.lastActive).toLowerCase()}
                              </p>
                            </div>
                            <ProgressBar
                              percent={seat.holder.percent}
                              finished={seat.holder.finished}
                            />
                          </div>
                          <div className="mt-2 border-t pt-2 text-right">
                            {seat.holder.releasable ? (
                              <button
                                className="text-xs text-destructive hover:underline"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Release ${seat.holder.name}? They lose access now; the Seat becomes open again.`
                                    )
                                  )
                                    team.release(seat.id, seat.holder);
                                }}
                              >
                                Release Seat
                              </button>
                            ) : (
                              <span
                                className="text-xs text-muted-foreground"
                                title="A Seat can only be Released while its holder has taken less than half the course and watched under 2 hours."
                              >
                                {RELEASE_LIMIT_REASON} ⓘ
                              </span>
                            )}
                          </div>
                        </div>
                      )
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  Invited ({invited.length}){paused && " · paused"}
                </h3>
                <div className="space-y-2">
                  {invited.map(
                    (seat) =>
                      seat.state === "invited" && (
                        <div
                          key={seat.id}
                          className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-900/10"
                        >
                          <p className="truncate text-sm">{seat.invitee.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Sent {ago(seat.invitee.sentAt).toLowerCase()}
                          </p>
                          {!paused && (
                            <div className="mt-2 flex gap-3 text-xs">
                              <button
                                className="text-primary hover:underline"
                                onClick={() => team.resend(seat.invitee.email)}
                              >
                                Resend
                              </button>
                              <button
                                className="text-muted-foreground hover:underline"
                                onClick={() => team.withdraw(seat.id, seat.invitee.email)}
                              >
                                Withdraw
                              </button>
                            </div>
                          )}
                        </div>
                      )
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Open</h3>
                <OpenSeatsBox p={p} team={team} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

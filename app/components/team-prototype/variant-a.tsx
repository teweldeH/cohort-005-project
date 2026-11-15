// PROTOTYPE — Variant A: one roster table per purchase, every Seat a row,
// actions inline in the last column. Throwaway.
import { Button } from "~/components/ui/button";
import { formatPrice } from "~/lib/utils";
import {
  ago,
  isPaused,
  isRefunded,
  RELEASE_LIMIT_REASON,
  type MockTeam,
} from "./types";
import { CopyLink, InviteForm, ProgressBar, PurchaseNotice, StatusChip } from "./shared";

export function VariantA({ team }: { team: MockTeam }) {
  return (
    <div className="space-y-10">
      {team.purchases.map((p) => {
        const paused = isPaused(p);
        const claimed = p.seats.filter((s) => s.state === "claimed").length;
        return (
          <section key={p.id}>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="text-lg font-semibold">{p.courseTitle}</h2>
                <p className="text-xs text-muted-foreground">
                  Bought {new Date(p.purchasedAt).toLocaleDateString()} ·{" "}
                  {formatPrice(p.amount)} · {claimed} / {p.seats.length} Seats claimed
                </p>
              </div>
            </div>
            <div className="mb-3">
              <PurchaseNotice purchase={p} />
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-4 py-2 font-medium">Person</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Progress</th>
                    <th className="px-4 py-2 font-medium">Last active</th>
                    <th className="px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {p.seats.map((seat) => (
                    <tr key={seat.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        {seat.state === "claimed" ? (
                          <>
                            <p className="font-medium">{seat.holder.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {seat.holder.email}
                            </p>
                          </>
                        ) : seat.state === "invited" ? (
                          <>
                            <p>{seat.invitee.email}</p>
                            <p className="text-xs text-muted-foreground">
                              Invited {ago(seat.invitee.sentAt).toLowerCase()}
                            </p>
                          </>
                        ) : (
                          <code className="rounded bg-muted px-2 py-0.5 text-xs">
                            {seat.code}
                          </code>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip seat={seat} paused={paused} />
                      </td>
                      <td className="px-4 py-3">
                        {seat.state === "claimed" && (
                          <ProgressBar
                            percent={seat.holder.percent}
                            finished={seat.holder.finished}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {seat.state === "claimed" && ago(seat.holder.lastActive)}
                      </td>
                      <td className="px-4 py-3">
                        {seat.state === "claimed" &&
                          (seat.holder.releasable ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Release ${seat.holder.name}'s Seat? They lose access to the course straight away. Their progress is kept if they ever get a Seat again.`
                                  )
                                )
                                  team.release(seat.id, seat.holder);
                              }}
                            >
                              Release
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {RELEASE_LIMIT_REASON}
                            </span>
                          ))}
                        {seat.state === "invited" && !paused && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => team.resend(seat.invitee.email)}
                            >
                              Resend
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => team.withdraw(seat.id, seat.invitee.email)}
                            >
                              Withdraw
                            </Button>
                          </div>
                        )}
                        {seat.state === "open" && !paused && !isRefunded(p) && (
                          <div className="flex items-center gap-2">
                            <InviteForm seatId={seat.id} team={team} compact />
                            <span className="text-xs text-muted-foreground">or</span>
                            <CopyLink code={seat.code} team={team} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

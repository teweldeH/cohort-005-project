// PROTOTYPE — Variant C: people first. One Team list across every course,
// sorted by last active, with a detail panel for the selected person; Seats
// left to fill sit in a narrow side column with a single "Invite someone"
// flow. Purchases fade into the background. Throwaway.
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  ago,
  isPaused,
  isRefunded,
  RELEASE_LIMIT_REASON,
  warnsOnFirstClaim,
  type MockTeam,
  type ProtoPurchase,
  type ProtoSeat,
} from "./types";
import { CopyLink, ProgressBar } from "./shared";

type Person = { seat: ProtoSeat; purchase: ProtoPurchase };

function InviteDialog({ team, onClose }: { team: MockTeam; onClose: () => void }) {
  const offerable = team.purchases.filter(
    (p) => !isPaused(p) && !isRefunded(p) && p.seats.some((s) => s.state === "open")
  );
  const [purchaseId, setPurchaseId] = useState(offerable[0]?.id);
  const [email, setEmail] = useState("");
  const purchase = offerable.find((p) => p.id === purchaseId);
  const seat = purchase?.seats.find((s) => s.state === "open");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Invite someone</h3>
          <button onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        {!purchase || !seat ? (
          <p className="text-sm text-muted-foreground">No open Seats to offer.</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.includes("@")) return;
              team.invite(seat.id, email);
              onClose();
            }}
          >
            <label className="block text-sm">
              Course
              <select
                value={purchaseId}
                onChange={(e) => setPurchaseId(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5"
              >
                {offerable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.courseTitle} ({p.seats.filter((s) => s.state === "open").length}{" "}
                    open)
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5"
                autoFocus
              />
            </label>
            {warnsOnFirstClaim(purchase) && (
              <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                Heads up: you can still get a Refund for this purchase. When this person
                claims their Seat, you no longer can.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              They'll get an email, and only they can claim the Seat. Their progress on
              this course will be visible to you.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Or <CopyLink code={seat.code} team={team} /> anyone can use
              </span>
              <Button type="submit">Send Invitation</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function DetailPanel({
  person,
  team,
  onClose,
}: {
  person: Person;
  team: MockTeam;
  onClose: () => void;
}) {
  const { seat, purchase } = person;
  const paused = isPaused(purchase);
  return (
    <aside className="rounded-lg border p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-lg font-semibold">
            {seat.state === "claimed" ? seat.holder.name : seat.state === "invited" ? seat.invitee.email : ""}
          </p>
          <p className="text-xs text-muted-foreground">{purchase.courseTitle}</p>
        </div>
        <button onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      {seat.state === "claimed" && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-muted-foreground">Progress</dt>
            <dd>
              <ProgressBar percent={seat.holder.percent} finished={seat.holder.finished} />
            </dd>
            <dt className="text-muted-foreground">Last active</dt>
            <dd>{ago(seat.holder.lastActive)}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate">{seat.holder.email}</dd>
          </dl>
          <div className="border-t pt-4">
            {seat.holder.releasable ? (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  Releasing ends their access to this course straight away and opens
                  the Seat for someone else. Their progress is kept if they ever get a
                  Seat again.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    team.release(seat.id, seat.holder);
                    onClose();
                  }}
                >
                  Release Seat
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">{RELEASE_LIMIT_REASON}.</span> A Seat can
                only be Released while its holder has taken less than half the course.
              </p>
            )}
          </div>
        </div>
      )}
      {seat.state === "invited" && (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Invited {ago(seat.invitee.sentAt).toLowerCase()}.
            {paused && " Paused while your Refund Request is reviewed."}
          </p>
          {!paused && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => team.resend(seat.invitee.email)}>
                Resend email
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  team.withdraw(seat.id, seat.invitee.email);
                  onClose();
                }}
              >
                Withdraw Invitation
              </Button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

export function VariantC({ team }: { team: MockTeam }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [inviting, setInviting] = useState(false);

  const people: Person[] = team.purchases
    .flatMap((purchase) => purchase.seats.map((seat) => ({ seat, purchase })))
    .filter((p) => p.seat.state === "claimed" || p.seat.state === "invited")
    // Invitees on top, then holders by most recently active
    .sort((a, b) => {
      const rank = (x: Person) => (x.seat.state === "invited" ? 1 : 0);
      const at = (x: Person) =>
        x.seat.state === "claimed" ? (x.seat.holder.lastActive ?? "") : "";
      return rank(b) - rank(a) || at(b).localeCompare(at(a));
    });
  const current = people.find((p) => p.seat.id === selected);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Team ({people.length})</h2>
          <Button onClick={() => setInviting(true)}>Invite someone</Button>
        </div>
        <ul className="divide-y rounded-lg border">
          {people.map(({ seat, purchase }) => (
            <li
              key={seat.id}
              onClick={() => setSelected(seat.id)}
              className={`flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-muted/50 ${selected === seat.id ? "bg-muted" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {seat.state === "claimed" ? seat.holder.name : seat.state === "invited" ? seat.invitee.email : ""}
                </p>
                <p className="truncate text-xs text-muted-foreground">{purchase.courseTitle}</p>
              </div>
              {seat.state === "claimed" ? (
                <>
                  <ProgressBar percent={seat.holder.percent} finished={seat.holder.finished} />
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {ago(seat.holder.lastActive)}
                  </span>
                </>
              ) : (
                <span className="w-24 text-right text-xs text-amber-700 dark:text-amber-300">
                  {isPaused(purchase) ? "Invited · paused" : "Invited"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        {current ? (
          <DetailPanel person={current} team={team} onClose={() => setSelected(null)} />
        ) : null}
        <div className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">Seats</h3>
          <ul className="space-y-3 text-sm">
            {team.purchases.map((p) => {
              const open = p.seats.filter((s) => s.state === "open").length;
              return (
                <li key={p.id}>
                  <p className="font-medium">{p.courseTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {isRefunded(p)
                      ? "Refunded"
                      : isPaused(p)
                        ? `${open} open · paused, Refund requested`
                        : `${open} open of ${p.seats.length}`}
                    {warnsOnFirstClaim(p) && " · still refundable"}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {inviting && <InviteDialog team={team} onClose={() => setInviting(false)} />}
    </div>
  );
}

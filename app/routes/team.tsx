import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/team";
import { getCurrentUserId } from "~/lib/session";
import { Button } from "~/components/ui/button";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { RefundRequestStatus } from "~/db/schema";
import {
  RefundRequestDeclined,
  RequestRefund,
} from "~/components/request-refund";
import { cn, formatPrice, formatRelativeTime } from "~/lib/utils";
import { parseFormData } from "~/lib/validation";
import { SeatProgressBar, formatLastActive } from "~/components/seat-progress";
import {
  getTeamRoster,
  inviteToSeat,
  releaseSeat,
  withdrawInvitation,
  type InviteRefusal,
  type ReleaseRefusal,
  type WithdrawRefusal,
  type RosterBanner,
  type RosterPurchase,
  type RosterSeat,
  type RosterSeatStatus,
} from "~/lib/seats/index.server";

export function meta() {
  return [
    { title: "Team — Cadence" },
    { name: "description", content: "Manage your team's course seats" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const result = getTeamRoster(currentUserId);
  if (!result.ok) {
    throw data("You don't have a team. Purchase team seats to create one.", {
      status: 403,
    });
  }

  return result.roster;
}

const seatActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("invite"),
    seatId: z.coerce.number().int().positive(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter the email address of the person to invite."),
  }),
  z.object({
    intent: z.literal("withdraw"),
    seatId: z.coerce.number().int().positive(),
  }),
  z.object({
    intent: z.literal("release"),
    seatId: z.coerce.number().int().positive(),
  }),
]);

const NOT_BUYER = "Only the Buyer can manage this Seat.";

/**
 * Why an Invitation was refused. The Buyer can fix the ones marked
 * `correctable` from the invite form, so they come back to it as a message.
 */
const INVITE_REFUSALS: Record<
  InviteRefusal,
  { message: string; status: number; correctable: boolean }
> = {
  "not-found": { message: "Seat not found.", status: 404, correctable: false },
  "not-buyer": { message: NOT_BUYER, status: 403, correctable: false },
  "not-open": {
    message: "This Seat is no longer open.",
    status: 409,
    correctable: true,
  },
  paused: {
    message: "Invitations are paused while your Refund Request is reviewed.",
    status: 409,
    correctable: true,
  },
  refunded: {
    message: "This purchase was refunded, so its Seats can't be offered.",
    status: 410,
    correctable: true,
  },
  "duplicate-invitation": {
    message:
      "That email already holds an Invitation or a Seat for this course on your Team.",
    status: 409,
    correctable: true,
  },
};

const WITHDRAW_REFUSALS: Record<
  WithdrawRefusal,
  { message: string; status: number }
> = {
  "not-found": { message: "Seat not found.", status: 404 },
  "not-buyer": { message: NOT_BUYER, status: 403 },
  paused: {
    message: "Invitations are paused while your Refund Request is reviewed.",
    status: 409,
  },
  "not-invited": {
    message: "This Seat has no Invitation to withdraw.",
    status: 409,
  },
};

const RELEASE_REFUSALS: Record<
  ReleaseRefusal,
  { message: string; status: number }
> = {
  "not-found": { message: "Seat not found.", status: 404 },
  "not-buyer": { message: NOT_BUYER, status: 403 },
  "not-claimed": {
    message: "Nobody holds this Seat, so there's nothing to Release.",
    status: 409,
  },
  "past-release-limit": {
    message:
      "This Seat's holder is past the Release limit, so it can't be Released.",
    status: 409,
  },
};

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const parsed = parseFormData(await request.formData(), seatActionSchema);
  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid request." },
      { status: 400 }
    );
  }

  if (parsed.data.intent === "invite") {
    const { seatId, email } = parsed.data;
    const result = inviteToSeat(currentUserId, seatId, email);
    if (!result.ok) {
      const { message, status, correctable } = INVITE_REFUSALS[result.reason];
      if (!correctable) throw data(message, { status });
      return data({ error: message }, { status });
    }
    return { error: null };
  }

  if (parsed.data.intent === "withdraw") {
    const result = withdrawInvitation(currentUserId, parsed.data.seatId);
    if (!result.ok) {
      const { message, status } = WITHDRAW_REFUSALS[result.reason];
      throw data(message, { status });
    }
    return { error: null };
  }

  const result = releaseSeat(currentUserId, parsed.data.seatId);
  if (!result.ok) {
    const { message, status } = RELEASE_REFUSALS[result.reason];
    throw data(message, { status });
  }
  return { error: null };
}

function CopyLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = `${window.location.origin}/claim/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
      title="Copy this Seat's link"
    >
      {copied ? (
        <>
          <Check className="size-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" />
          Copy link
        </>
      )}
    </button>
  );
}

/** The purchase-wide notice above a Team Purchase's Seats. */
function PurchaseBanner({ banner }: { banner: RosterBanner }) {
  if (banner === "refunded") {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Refunded. This purchase&apos;s Seats can no longer be claimed.
      </p>
    );
  }
  if (banner === "paused") {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Refund requested. Invitations are paused and no Seat can be claimed or
        offered until we&apos;ve reviewed it. If it&apos;s declined, they resume.
      </p>
    );
  }
  if (banner === "still-refundable") {
    return (
      <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        You can still get a Refund for this purchase. Once anyone claims one of
        its Seats, you can&apos;t, even if you later Release them.
      </p>
    );
  }
  return null;
}

const STATUS_LABEL: Record<RosterSeatStatus, string> = {
  claimed: "Claimed",
  invited: "Invited",
  "invited-paused": "Invited · paused",
  open: "Open",
  refunded: "Refunded",
};

const STATUS_STYLE: Record<RosterSeatStatus, string> = {
  claimed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  invited:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "invited-paused": "bg-muted text-muted-foreground",
  open: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  refunded: "bg-muted text-muted-foreground",
};

function StatusChip({ status }: { status: RosterSeatStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLE[status]
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Who holds the Seat, or its code while nobody does. */
function SeatPerson({ seat }: { seat: RosterSeat }) {
  if (seat.status === "claimed") {
    return (
      <>
        <p className="font-medium">{seat.holder.name}</p>
        <p className="text-xs text-muted-foreground">{seat.holder.email}</p>
      </>
    );
  }
  if (seat.status === "invited" || seat.status === "invited-paused") {
    return (
      <>
        <p>{seat.invitedEmail}</p>
        <p className="text-xs text-muted-foreground">
          Invited {formatRelativeTime(seat.invitedAt)}
        </p>
      </>
    );
  }
  return (
    <code className="rounded bg-muted px-2 py-0.5 text-xs">{seat.code}</code>
  );
}

/** Offers an open Seat to one person, named by email. */
function InviteForm({ seatId }: { seatId: number }) {
  const fetcher = useFetcher<typeof action>();
  const error = fetcher.state === "idle" ? fetcher.data?.error : null;

  return (
    <fetcher.Form method="post" className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input type="hidden" name="intent" value="invite" />
        <input type="hidden" name="seatId" value={seatId} />
        <input
          type="email"
          name="email"
          required
          aria-label="Email to invite"
          aria-invalid={!!error}
          placeholder="name@company.com"
          className="w-48 rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={fetcher.state !== "idle"}
        >
          Invite
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </fetcher.Form>
  );
}

function WithdrawButton({ seatId }: { seatId: number }) {
  const fetcher = useFetcher<typeof action>();

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="withdraw" />
      <input type="hidden" name="seatId" value={seatId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={fetcher.state !== "idle"}
      >
        Withdraw
      </Button>
    </fetcher.Form>
  );
}

/**
 * Takes a claimed Seat back, after the Buyer confirms. The holder loses
 * access at once, so the button first asks.
 */
function ReleaseButton({ seatId }: { seatId: number }) {
  const fetcher = useFetcher<typeof action>();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        Release
      </Button>
    );
  }

  return (
    <fetcher.Form method="post" className="flex max-w-xs flex-col gap-2">
      <input type="hidden" name="intent" value="release" />
      <input type="hidden" name="seatId" value={seatId} />
      <p className="text-xs text-muted-foreground">
        They lose access straight away; their progress is kept if they get a
        Seat again.
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          disabled={fetcher.state !== "idle"}
        >
          Release Seat
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    </fetcher.Form>
  );
}

/**
 * What the Buyer can do with one Seat: Invite to an open Seat or share its
 * link, copy or Withdraw an Invitation, Release a claimed Seat. Nothing while
 * a Refund Request has paused the purchase.
 */
function SeatActions({
  seat,
  banner,
}: {
  seat: RosterSeat;
  banner: RosterBanner;
}) {
  if (banner === "paused") return null;
  if (seat.status === "open") {
    return (
      <div className="flex flex-wrap items-start gap-2">
        <InviteForm seatId={seat.id} />
        <span className="py-1 text-xs text-muted-foreground">or</span>
        <CopyLink code={seat.code} />
      </div>
    );
  }
  if (seat.status === "invited") {
    return (
      <div className="flex items-center gap-1">
        <CopyLink code={seat.code} />
        <WithdrawButton seatId={seat.id} />
      </div>
    );
  }
  if (seat.status === "claimed") {
    if (seat.releasable) return <ReleaseButton seatId={seat.id} />;
    return (
      <span className="text-xs text-muted-foreground">
        Past the Release limit
      </span>
    );
  }
  return null;
}

/** Ways to get money back for a Team Purchase, or what became of asking. */
function RefundControls({ purchase }: { purchase: RosterPurchase }) {
  if (purchase.canRequestRefund) {
    return <RequestRefund slug={purchase.course.slug} offer={purchase} />;
  }
  if (purchase.refundRequestStatus === RefundRequestStatus.Declined) {
    return <RefundRequestDeclined />;
  }
  return null;
}

function PurchaseSection({ purchase }: { purchase: RosterPurchase }) {
  return (
    <section aria-labelledby={`purchase-${purchase.purchaseId}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id={`purchase-${purchase.purchaseId}`}
            className="text-lg font-semibold"
          >
            {purchase.course.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            Bought {new Date(purchase.purchasedAt).toLocaleDateString()} ·{" "}
            {formatPrice(purchase.amount)} · {purchase.claimedSeats} /{" "}
            {purchase.totalSeats} Seats claimed
          </p>
        </div>
        <Link to={`/courses/${purchase.course.slug}/purchase?mode=team`}>
          <Button variant="outline" size="sm">
            Buy more seats
          </Button>
        </Link>
      </div>

      {purchase.banner && (
        <div className="mb-3">
          <PurchaseBanner banner={purchase.banner} />
        </div>
      )}

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
            {purchase.seats.map((seat) => (
              <tr key={seat.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <SeatPerson seat={seat} />
                </td>
                <td className="px-4 py-3">
                  <StatusChip status={seat.status} />
                </td>
                <td className="px-4 py-3">
                  {seat.status === "claimed" && (
                    <SeatProgressBar
                      percent={seat.progress.percent}
                      finished={seat.progress.finished}
                    />
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {seat.status === "claimed" &&
                    formatLastActive(seat.progress.lastActive)}
                </td>
                <td className="px-4 py-3">
                  <SeatActions seat={seat} banner={purchase.banner} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 max-w-sm">
        <RefundControls purchase={purchase} />
      </div>
    </section>
  );
}

export default function Team({ loaderData }: Route.ComponentProps) {
  const { purchases } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Team</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Team Management</h1>
        <p className="mt-1 text-muted-foreground">
          Every Seat your Team Purchases give you, and who holds it
        </p>
      </div>

      {purchases.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Seats yet.</p>
      ) : (
        <div className="space-y-10">
          {purchases.map((purchase) => (
            <PurchaseSection key={purchase.purchaseId} purchase={purchase} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "No team found";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have a team yet.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
          <Link to="/courses">
            <Button variant="outline">Browse Courses</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

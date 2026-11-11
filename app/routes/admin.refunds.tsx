import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/admin.refunds";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import {
  courses,
  purchases,
  refundRequests,
  users,
  RefundRequestStatus,
  UserRole,
} from "~/db/schema";
import { db } from "~/db";
import { asc, desc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
import { data, isRouteErrorResponse, Link } from "react-router";
import { formatPrice } from "~/lib/utils";
import { type RefundDecisionOutcome } from "~/lib/refunds";
import {
  decideRefundRequest,
  getUsage,
  type RefundDecision,
} from "~/lib/refunds.server";
import { RefundRequestBadge } from "~/components/refund-request-badge";

const RECENTLY_DECIDED_LIMIT = 20;

const decisionNote = z
  .string()
  .trim()
  .max(1000, "Keep the note under 1000 characters.");

const refundDecisionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    refundRequestId: z.coerce.number().int().positive(),
    note: decisionNote.optional().transform((note) => note || null),
  }),
  z.object({
    intent: z.literal("decline"),
    refundRequestId: z.coerce.number().int().positive(),
    note: decisionNote.min(1, "Tell the Buyer why their request was declined."),
  }),
]);

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

function requireAdmin(userId: number | null) {
  if (!userId) {
    throw data(
      "Select a user from the DevUI panel to manage Refund Requests.",
      {
        status: 401,
      }
    );
  }

  const user = getUserById(userId);

  if (!user || user.role !== UserRole.Admin) {
    throw data("Only admins can decide Refund Requests.", { status: 403 });
  }

  return user;
}

const buyers = alias(users, "buyer");
const deciders = alias(users, "decider");

function selectRefundRequests() {
  return db
    .select({
      id: refundRequests.id,
      status: refundRequests.status,
      reason: refundRequests.reason,
      requestedAt: refundRequests.requestedAt,
      amountRefunded: refundRequests.amountRefunded,
      decisionNote: refundRequests.decisionNote,
      resolvedAt: refundRequests.resolvedAt,
      decidedBy: deciders.name,
      purchaseId: purchases.id,
      purchasedAt: purchases.createdAt,
      amountPaid: purchases.amountPaid,
      buyerId: buyers.id,
      buyerName: buyers.name,
      buyerEmail: buyers.email,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(buyers, eq(purchases.userId, buyers.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .leftJoin(deciders, eq(refundRequests.resolvedByUserId, deciders.id));
}

function getRefundRequestWithPurchase(id: number) {
  return db
    .select({
      status: refundRequests.status,
      purchase: purchases,
      courseTitle: courses.title,
      buyerName: users.name,
      buyerEmail: users.email,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(eq(refundRequests.id, id))
    .get();
}

/**
 * The outcome email the Buyer gets, from the Cadence team rather than the
 * Admin who decided. There is no mail transport wired up yet, so the built
 * message goes to the server log.
 */
function buildRefundDecisionEmail(input: {
  buyerName: string;
  buyerEmail: string;
  courseTitle: string;
  purchasedAt: string;
  amount: number;
  outcome: RefundDecisionOutcome;
  note: string | null;
}) {
  const purchase = `your purchase of "${input.courseTitle}" on ${new Date(input.purchasedAt).toLocaleDateString()}`;
  const outcome =
    input.outcome === "approve"
      ? [
          `We have approved your Refund Request for ${purchase}.`,
          `Your Refund of ${formatPrice(input.amount)} is on its way, and what this purchase gave has ended.`,
        ]
      : [`We have declined your Refund Request for ${purchase}.`];

  return {
    to: input.buyerEmail,
    subject: `Refund Request ${input.outcome === "approve" ? "approved" : "declined"} — ${input.courseTitle}`,
    body: [
      `Hi ${input.buyerName},`,
      "",
      ...outcome,
      ...(input.note ? ["", input.note] : []),
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Approve or decline Refund Requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = requireAdmin(await getCurrentUserId(request));

  const waiting = selectRefundRequests()
    .where(eq(refundRequests.status, RefundRequestStatus.Requested))
    .orderBy(asc(refundRequests.requestedAt))
    .all()
    .map((refundRequest) => ({
      ...refundRequest,
      isOwnPurchaseOfAdmin: refundRequest.buyerId === admin.id,
      usage: getUsage(
        refundRequest.purchaseId,
        refundRequest.buyerId,
        refundRequest.courseId
      ),
    }));

  const recentlyDecided = selectRefundRequests()
    .where(ne(refundRequests.status, RefundRequestStatus.Requested))
    .orderBy(desc(refundRequests.resolvedAt))
    .limit(RECENTLY_DECIDED_LIMIT)
    .all();

  return { waiting, recentlyDecided };
}

export async function action({ request }: Route.ActionArgs) {
  const admin = requireAdmin(await getCurrentUserId(request));

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundDecisionSchema);

  if (!parsed.success) {
    throw data(Object.values(parsed.errors)[0] ?? "Invalid decision.", {
      status: 400,
    });
  }

  const { intent, refundRequestId, note } = parsed.data;
  const refundRequest = getRefundRequestWithPurchase(refundRequestId);

  if (!refundRequest) {
    throw data("Refund Request not found.", { status: 404 });
  }

  if (refundRequest.purchase.userId === admin.id) {
    throw data(
      "Another Admin must decide a Refund Request on your own purchase.",
      {
        status: 403,
      }
    );
  }

  const decision: RefundDecision =
    intent === "approve"
      ? { outcome: "approve", note }
      : { outcome: "decline", note };

  if (
    refundRequest.status !== RefundRequestStatus.Requested ||
    !decideRefundRequest(
      refundRequestId,
      refundRequest.purchase,
      decision,
      admin.id
    )
  ) {
    throw data("This Refund Request has already been decided.", {
      status: 409,
    });
  }

  const email = buildRefundDecisionEmail({
    buyerName: refundRequest.buyerName,
    buyerEmail: refundRequest.buyerEmail,
    courseTitle: refundRequest.courseTitle,
    purchasedAt: refundRequest.purchase.createdAt,
    amount: refundRequest.purchase.amountPaid,
    outcome: intent,
    note,
  });

  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);

  return { decided: intent };
}

function formatWatched(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}

type WaitingRequest = Route.ComponentProps["loaderData"]["waiting"][number];

/** What ends if the Refund Request is Approved, in the Admin's words. */
function whatApprovalEnds(refundRequest: WaitingRequest) {
  return refundRequest.usage.kind === "team"
    ? `Its ${refundRequest.usage.seats} Seats can never be claimed.`
    : `${refundRequest.buyerName}'s Enrollment in ${refundRequest.courseTitle} ends. Their progress is kept.`;
}

function DecideRefundRequest({
  refundRequest,
}: {
  refundRequest: WaitingRequest;
}) {
  const fetcher = useFetcher<typeof action>();
  const [deciding, setDeciding] = useState<RefundDecisionOutcome | null>(
    null
  );
  const [note, setNote] = useState("");
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.decided) {
      toast.success(
        fetcher.data.decided === "approve"
          ? "Refund Request approved."
          : "Refund Request declined."
      );
    }
  }, [fetcher.state, fetcher.data]);

  if (refundRequest.isOwnPurchaseOfAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        This is your own purchase. Another Admin must decide it.
      </p>
    );
  }

  if (!deciding) {
    return (
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setDeciding("approve")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDeciding("decline")}
        >
          Decline
        </Button>
      </div>
    );
  }

  const approving = deciding === "approve";
  // The action rejects a blank Decline note too, but only after the page is
  // gone; catching it here keeps the Admin on the form.
  const missingDeclineNote = !approving && note.trim() === "";

  return (
    <fetcher.Form method="post" className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">
        {approving
          ? `Refund ${formatPrice(refundRequest.amountPaid)} to ${refundRequest.buyerName}?`
          : `Decline ${refundRequest.buyerName}'s Refund Request for ${formatPrice(refundRequest.amountPaid)}?`}
      </p>
      <p className="text-xs text-muted-foreground">
        {approving
          ? whatApprovalEnds(refundRequest)
          : "They can't ask about this purchase again."}{" "}
        This can't be undone.
      </p>
      <input type="hidden" name="intent" value={deciding} />
      <input type="hidden" name="refundRequestId" value={refundRequest.id} />
      <Textarea
        name="note"
        rows={2}
        required={!approving}
        maxLength={1000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={
          approving
            ? "A note to the Buyer (optional)"
            : "Tell the Buyer why (required)"
        }
      />
      {missingDeclineNote && note.length > 0 && (
        <p className="text-xs text-destructive">
          Tell the Buyer why their request was declined.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant={approving ? "default" : "destructive"}
          disabled={isSubmitting || missingDeclineNote}
        >
          {isSubmitting
            ? "Saving..."
            : approving
              ? "Approve Refund"
              : "Decline Refund Request"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setDeciding(null);
            setNote("");
          }}
        >
          Back
        </Button>
      </div>
    </fetcher.Form>
  );
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { waiting, recentlyDecided } = loaderData;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          {waiting.length === 0
            ? "Nothing is waiting on a decision."
            : `${waiting.length} waiting on a decision, oldest first.`}
        </p>
      </div>

      <div className="space-y-4">
        {waiting.map((refundRequest) => (
          <Card key={refundRequest.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    to={`/courses/${refundRequest.courseSlug}`}
                    className="font-semibold hover:underline"
                  >
                    {refundRequest.courseTitle}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {refundRequest.buyerName} · {refundRequest.buyerEmail}
                  </p>
                </div>
                <span className="shrink-0 text-lg font-semibold">
                  {formatPrice(refundRequest.amountPaid)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {refundRequest.usage.kind === "team"
                  ? `Team Purchase · ${refundRequest.usage.claimedSeats} of ${refundRequest.usage.seats} Seats claimed`
                  : `Own Purchase · ${refundRequest.usage.completedLessonCount} of ${refundRequest.usage.lessonCount} lessons completed · ${formatWatched(refundRequest.usage.secondsWatched)} watched`}{" "}
                · purchased{" "}
                {new Date(refundRequest.purchasedAt).toLocaleDateString()} ·
                asked {new Date(refundRequest.requestedAt).toLocaleDateString()}
              </p>
              <p className="text-sm">{refundRequest.reason}</p>
              <DecideRefundRequest refundRequest={refundRequest} />
            </CardContent>
          </Card>
        ))}
      </div>

      {recentlyDecided.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">Recently decided</h2>
          <div className="space-y-3">
            {recentlyDecided.map((refundRequest) => (
              <div key={refundRequest.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{refundRequest.courseTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      {refundRequest.buyerName} ·{" "}
                      {formatPrice(
                        refundRequest.amountRefunded ?? refundRequest.amountPaid
                      )}{" "}
                      · decided{" "}
                      {refundRequest.resolvedAt &&
                        new Date(
                          refundRequest.resolvedAt
                        ).toLocaleDateString()}{" "}
                      by {refundRequest.decidedBy ?? "an Admin"}
                    </p>
                  </div>
                  <RefundRequestBadge status={refundRequest.status} />
                </div>
                {refundRequest.decisionNote && (
                  <p className="mt-2 text-sm">{refundRequest.decisionNote}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading Refund Requests.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can access this page.";
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
          <Link to="/admin/refunds">
            <Button>Back to Refund Requests</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

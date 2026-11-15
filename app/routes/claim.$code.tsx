import {
  Link,
  useFetcher,
  redirect,
  isRouteErrorResponse,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import { z } from "zod";
import type { Route } from "./+types/claim.$code";
import { getCurrentUserId } from "~/lib/session";
import { resolveCountry } from "~/lib/country.server";
import { parseParams, parseFormData } from "~/lib/validation";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Ticket, AlertCircle, CheckCircle2, Globe, Mail } from "lucide-react";
import { data } from "react-router";
import {
  claimSeat,
  getClaimSignIn,
  getClaimView,
  turnDownInvitation,
  type ClaimRefusal,
  type TurnDownRefusal,
} from "~/lib/seats/index.server";

const SEAT_ON_HOLD_MESSAGE =
  "This seat can't be claimed right now. Please ask the person who shared this link.";
const SEAT_REFUNDED_MESSAGE =
  "This seat is no longer available. Please ask the person who shared this link.";
// A code stops existing when an Invitation is made or withdrawn, and there is
// no telling that apart from a mistyped one.
const NO_LONGER_AVAILABLE_MESSAGE =
  "This Invitation is no longer available. Please ask the person who shared this link for a new one.";
const DIFFERENT_ADDRESS_MESSAGE =
  "This Invitation is for a different address. Log in with the email it was sent to.";

/** Why a claim was refused, as the claim page reports it. */
const CLAIM_REFUSALS: Record<ClaimRefusal, { message: string; status: number }> =
  {
    "not-found": { message: NO_LONGER_AVAILABLE_MESSAGE, status: 404 },
    "already-claimed": {
      message: "This seat has already been claimed.",
      status: 409,
    },
    paused: { message: SEAT_ON_HOLD_MESSAGE, status: 409 },
    refunded: { message: SEAT_REFUNDED_MESSAGE, status: 410 },
    "not-invited-email": { message: DIFFERENT_ADDRESS_MESSAGE, status: 403 },
    "already-enrolled": {
      message: "You are already enrolled in this course.",
      status: 409,
    },
    "country-mismatch": {
      message:
        "This seat can only be claimed from the same country as the buyer.",
      status: 403,
    },
  };

/** Why a Turn down was refused, as the claim page reports it. */
const TURN_DOWN_REFUSALS: Record<
  TurnDownRefusal,
  { message: string; status: number }
> = {
  "not-found": { message: NO_LONGER_AVAILABLE_MESSAGE, status: 404 },
  "not-invitee": {
    message: "Only the person this Invitation is for can Turn it down.",
    status: 403,
  },
};

const claimParamsSchema = z.object({
  code: z.string().min(1),
});

const claimActionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("confirm-claim") }),
  z.object({ intent: z.literal("turn-down") }),
]);

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Claim a Seat";
  return [
    { title: `Claim a Seat: ${title} — Cadence` },
    { name: "description", content: `Claim your seat on ${title}` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { code } = parseParams(params, claimParamsSchema);

  const currentUserId = await getCurrentUserId(request);
  const viewer = currentUserId
    ? { userId: currentUserId, country: await resolveCountry(request) }
    : null;

  if (!viewer) {
    const signIn = getClaimSignIn(code);
    if (!signIn.ok) throw data(NO_LONGER_AVAILABLE_MESSAGE, { status: 404 });
    // Log in, or sign up with the invited email filled in, then come back.
    const query = new URLSearchParams({ redirectTo: `/claim/${code}` });
    if (signIn.invitedEmail) query.set("email", signIn.invitedEmail);
    throw redirect(`/login?${query}`);
  }

  const result = getClaimView(code, viewer);
  if (!result.ok) throw data(NO_LONGER_AVAILABLE_MESSAGE, { status: 404 });

  return result.view;
}

export async function action({ params, request }: Route.ActionArgs) {
  const { code } = parseParams(params, claimParamsSchema);

  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, claimActionSchema);

  if (!parsed.success) {
    throw data("Invalid action.", { status: 400 });
  }

  if (parsed.data.intent === "turn-down") {
    const turnedDown = turnDownInvitation(code, currentUserId);
    if (!turnedDown.ok) {
      const { message, status } = TURN_DOWN_REFUSALS[turnedDown.reason];
      throw data(message, { status });
    }
    return { turnedDown: true };
  }

  const userCountry = await resolveCountry(request);
  const result = claimSeat(code, currentUserId, userCountry);
  if (!result.ok) {
    const { message, status } = CLAIM_REFUSALS[result.reason];
    throw data(message, { status });
  }

  throw redirect(`/courses/${result.course.slug}/welcome`);
}

/**
 * After a Turn down the Seat's code no longer exists, so reloading the claim
 * page would only say the Invitation is gone. Keep the page and say what
 * happened instead.
 */
export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (actionResult?.turnedDown) return false;
  return defaultShouldRevalidate;
}

export default function Claim({ loaderData }: Route.ComponentProps) {
  const {
    course,
    code,
    invitation,
    buyerName,
    alreadyClaimed,
    alreadyEnrolled,
    paused,
    refunded,
    countryMismatch,
    buyerCountry,
  } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== "idle";

  const forSomeoneElse = invitation !== null && !invitation.forViewer;
  const forViewer = invitation !== null && invitation.forViewer;

  if (fetcher.data?.turnedDown) {
    return (
      <div className="mx-auto max-w-2xl p-6 lg:p-8">
        <h1 className="mb-8 text-2xl font-bold">Invitation turned down</h1>
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="mb-2 text-xl font-semibold">{course.title}</h2>
            <p className="text-sm text-muted-foreground">
              You turned down this Invitation. The Seat has gone back to{" "}
              {buyerName}, and this link no longer works.
            </p>
            <div className="mt-6">
              <Link
                to="/courses"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Browse courses
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Only the invitee may Turn down, and only while they could claim or are
  // told why they can't. While the purchase is paused the Seat is on hold,
  // so there is nothing to Turn down.
  const turnDown = forViewer && !paused ? (
    <fetcher.Form method="post" className="mt-4">
      <input type="hidden" name="intent" value="turn-down" />
      <Button variant="outline" disabled={isSubmitting}>
        Turn down
      </Button>
    </fetcher.Form>
  ) : null;

  // Determine which state to show
  const canClaim =
    !forSomeoneElse &&
    !alreadyClaimed &&
    !alreadyEnrolled &&
    !paused &&
    !refunded &&
    !countryMismatch;

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h1 className="mb-2 text-2xl font-bold">Claim a Seat</h1>
      <p className="mb-8 text-muted-foreground">
        You&apos;ve been invited to enroll in a course.
      </p>

      <Card>
        <CardContent className="p-8 text-center">
          <div className="mb-4 inline-flex size-16 items-center justify-center rounded-full bg-primary/10">
            <Ticket className="size-8 text-primary" />
          </div>

          <h2 className="mb-2 text-xl font-semibold">{course.title}</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Seat code:{" "}
            <code className="rounded bg-muted px-2 py-0.5">{code}</code>
          </p>

          {alreadyClaimed ? (
            <div className="rounded-lg bg-destructive/10 p-4">
              <div className="flex items-center justify-center gap-2 text-destructive">
                <AlertCircle className="size-5" />
                <span className="font-medium">
                  This seat has already been claimed
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Someone has already claimed this seat. Please ask the person who
                shared this link for a new seat.
              </p>
            </div>
          ) : refunded ? (
            <div className="rounded-lg bg-destructive/10 p-4">
              <div className="flex items-center justify-center gap-2 text-destructive">
                <AlertCircle className="size-5" />
                <span className="font-medium">Seat no longer available</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {SEAT_REFUNDED_MESSAGE}
              </p>
            </div>
          ) : forSomeoneElse ? (
            <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
              <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400">
                <Mail className="size-5" />
                <span className="font-medium">
                  This Invitation is for a different address
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Log in with the email address this Invitation was sent to.
              </p>
            </div>
          ) : alreadyEnrolled && forViewer && !paused ? (
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
              <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="size-5" />
                <span className="font-medium">
                  You already have this course
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                You don&apos;t need this Seat. Turn down the Invitation so{" "}
                {buyerName} can give it to someone else.
              </p>
              {turnDown}
              <Link
                to={`/courses/${course.slug}`}
                className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
              >
                Go to Course
              </Link>
            </div>
          ) : alreadyEnrolled && !forViewer ? (
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
              <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="size-5" />
                <span className="font-medium">
                  You&apos;re already enrolled
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                You&apos;re already enrolled in this course. The seat has not
                been claimed, so it can still be shared with someone else.
              </p>
              <Link to={`/courses/${course.slug}`}>
                <Button className="mt-4" size="lg">
                  Go to Course
                </Button>
              </Link>
            </div>
          ) : paused ? (
            <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
              <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertCircle className="size-5" />
                <span className="font-medium">Seat on hold</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {SEAT_ON_HOLD_MESSAGE}
              </p>
            </div>
          ) : countryMismatch ? (
            <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
              <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400">
                <Globe className="size-5" />
                <span className="font-medium">Region restriction</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                This Seat can only be claimed from the country it was bought
                in{buyerCountry ? ` (${buyerCountry})` : ""}, and you appear to
                be somewhere else. If you&apos;re away, claim it once
                you&apos;re back.
              </p>
              {turnDown}
            </div>
          ) : (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="confirm-claim" />
              <p className="mb-4 text-sm text-muted-foreground">
                Your progress on this course will be visible to {buyerName}.
              </p>
              <Button
                size="lg"
                className="w-full max-w-sm"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Enrolling..." : "Enroll Now"}
              </Button>
            </fetcher.Form>
          )}
          {canClaim && turnDown}

          <div className="mt-6">
            <Link
              to={`/courses/${course.slug}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              View course details
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message =
    isRouteErrorResponse(error) && typeof error.data === "string"
      ? error.data
      : "This seat couldn't be claimed.";

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h1 className="mb-2 text-2xl font-bold">Claim a Seat</h1>
      <div className="mt-8 rounded-lg bg-destructive/10 p-4">
        <div className="flex items-center justify-center gap-2 text-destructive">
          <AlertCircle className="size-5" />
          <span className="font-medium">{message}</span>
        </div>
      </div>
      <div className="mt-6 text-center">
        <Link
          to="/courses"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Browse courses
        </Link>
      </div>
    </div>
  );
}

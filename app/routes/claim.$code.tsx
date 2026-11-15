import { Link, useFetcher, redirect, isRouteErrorResponse } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/claim.$code";
import { getCurrentUserId } from "~/lib/session";
import { resolveCountry } from "~/lib/country.server";
import { parseParams, parseFormData } from "~/lib/validation";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Ticket, AlertCircle, CheckCircle2, Globe } from "lucide-react";
import { data } from "react-router";
import {
  claimSeat,
  getClaimView,
  type ClaimRefusal,
} from "~/lib/seats/index.server";

const SEAT_ON_HOLD_MESSAGE =
  "This seat can't be claimed right now. Please ask the person who shared this link.";
const SEAT_REFUNDED_MESSAGE =
  "This seat is no longer available. Please ask the person who shared this link.";

/** Why a claim was refused, as the claim page reports it. */
const CLAIM_REFUSALS: Record<ClaimRefusal, { message: string; status: number }> =
  {
    "not-found": { message: "Seat not found.", status: 404 },
    "already-claimed": {
      message: "This seat has already been claimed.",
      status: 409,
    },
    paused: { message: SEAT_ON_HOLD_MESSAGE, status: 409 },
    refunded: { message: SEAT_REFUNDED_MESSAGE, status: 410 },
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

const claimParamsSchema = z.object({
  code: z.string().min(1),
});

const claimActionSchema = z.object({
  intent: z.literal("confirm-claim"),
});

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

  const result = getClaimView(code, viewer);
  if (!result.ok) {
    if (result.reason === "signed-out") {
      throw redirect(
        `/login?redirectTo=${encodeURIComponent(`/claim/${code}`)}`
      );
    }
    throw data("Seat not found.", { status: 404 });
  }

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

  const userCountry = await resolveCountry(request);
  const result = claimSeat(code, currentUserId, userCountry);
  if (!result.ok) {
    const { message, status } = CLAIM_REFUSALS[result.reason];
    throw data(message, { status });
  }

  throw redirect(`/courses/${result.course.slug}/welcome`);
}

export default function Claim({ loaderData }: Route.ComponentProps) {
  const {
    course,
    code,
    buyerName,
    alreadyClaimed,
    alreadyEnrolled,
    paused,
    refunded,
    countryMismatch,
  } = loaderData;
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  // Determine which state to show
  const canClaim =
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
          ) : alreadyEnrolled ? (
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
                This seat can only be claimed from the same country as the
                buyer. Your location doesn&apos;t match the buyer&apos;s
                country.
              </p>
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

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
import { db } from "~/db";
import {
  purchases,
  seats,
  courses,
  enrollments,
  RefundRequestStatus,
} from "~/db/schema";
import { eq, and } from "drizzle-orm";
import { getRefundRequestStatus } from "~/lib/refunds.server";

const SEAT_ON_HOLD_MESSAGE =
  "This seat can't be claimed right now. Please ask the person who shared this link.";
const SEAT_REFUNDED_MESSAGE =
  "This seat is no longer available. Please ask the person who shared this link.";

function getCourseById(id: number) {
  return db.select().from(courses).where(eq(courses.id, id)).get();
}

function getSeatByCode(code: string) {
  return db.select().from(seats).where(eq(seats.code, code)).get();
}

function isUserEnrolled(userId: number, courseId: number) {
  const existing = db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();

  return !!existing;
}

function getPurchaseById(id: number) {
  return db.select().from(purchases).where(eq(purchases.id, id)).get();
}

/** Claims a Seat for a user, giving them an Enrollment, or throws why not. */
function claimSeat(code: string, userId: number, userCountry: string) {
  const seat = getSeatByCode(code);
  if (!seat) {
    throw data("Seat not found.", { status: 404 });
  }

  if (seat.claimedByUserId !== null) {
    throw data("This seat has already been claimed.", { status: 409 });
  }

  // A claimed Seat rules out a Refund, so no Seat is claimed while the Buyer
  // is waiting on one, and a refunded purchase's Seats are gone for good.
  const refundRequestStatus = getRefundRequestStatus(seat.purchaseId);
  if (refundRequestStatus === RefundRequestStatus.Requested) {
    throw data(SEAT_ON_HOLD_MESSAGE, { status: 409 });
  }
  if (refundRequestStatus === RefundRequestStatus.Approved) {
    throw data(SEAT_REFUNDED_MESSAGE, { status: 410 });
  }

  if (isUserEnrolled(userId, seat.courseId)) {
    throw data("You are already enrolled in this course.", { status: 409 });
  }

  const purchase = getPurchaseById(seat.purchaseId);
  if (purchase?.country && purchase.country !== userCountry) {
    throw data(
      "This seat can only be claimed from the same country as the buyer.",
      { status: 403 }
    );
  }

  db.update(seats)
    .set({
      claimedByUserId: userId,
      claimedAt: new Date().toISOString(),
    })
    .where(eq(seats.id, seat.id))
    .run();

  return db
    .insert(enrollments)
    .values({ userId, courseId: seat.courseId })
    .returning()
    .get();
}

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

  const seat = getSeatByCode(code);
  if (!seat) {
    throw data("Seat not found.", { status: 404 });
  }

  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw redirect(
      `/login?redirectTo=${encodeURIComponent(`/claim/${code}`)}`
    );
  }

  const course = getCourseById(seat.courseId);
  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  const alreadyClaimed = seat.claimedByUserId !== null;
  const alreadyEnrolled = isUserEnrolled(currentUserId, seat.courseId);
  const refundRequestStatus = alreadyClaimed
    ? null
    : getRefundRequestStatus(seat.purchaseId);
  const onHold = refundRequestStatus === RefundRequestStatus.Requested;
  const refunded = refundRequestStatus === RefundRequestStatus.Approved;

  // Check country mismatch upfront so we can show a clear message
  let countryMismatch = false;
  if (!alreadyClaimed && !alreadyEnrolled) {
    const userCountry = await resolveCountry(request);
    const purchase = getPurchaseById(seat.purchaseId);
    if (purchase?.country && purchase.country !== (userCountry ?? "")) {
      countryMismatch = true;
    }
  }

  return {
    course: { id: course.id, title: course.title, slug: course.slug },
    code,
    alreadyClaimed,
    alreadyEnrolled,
    onHold,
    refunded,
    countryMismatch,
  };
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
  const enrollment = claimSeat(code, currentUserId, userCountry ?? "");

  const course = getCourseById(enrollment.courseId);
  if (!course) {
    throw redirect("/courses");
  }

  throw redirect(`/courses/${course.slug}/welcome`);
}

export default function Claim({ loaderData }: Route.ComponentProps) {
  const {
    course,
    code,
    alreadyClaimed,
    alreadyEnrolled,
    onHold,
    refunded,
    countryMismatch,
  } = loaderData;
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  // Determine which state to show
  const canClaim =
    !alreadyClaimed &&
    !alreadyEnrolled &&
    !onHold &&
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
          ) : onHold ? (
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

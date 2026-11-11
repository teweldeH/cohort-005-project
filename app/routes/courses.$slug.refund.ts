import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { courses, purchases, refunds, users, RefundStatus } from "~/db/schema";
import { and, eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import {
  isTeamPurchase,
  REFUND_WINDOW_DAYS,
  type RefundIneligibleReason,
} from "~/lib/refunds";
import { getRefundEligibility, getSeatCounts } from "~/lib/refunds.server";

const INELIGIBLE_RESPONSES: Record<
  RefundIneligibleReason,
  { message: string; status: number }
> = {
  free: { message: "A free purchase has nothing to refund.", status: 403 },
  "request-open": {
    message: "You already have a request open on this purchase.",
    status: 409,
  },
  refunded: {
    message: "This purchase has already been refunded.",
    status: 409,
  },
  declined: {
    message: "Your Refund Request for this purchase was declined.",
    status: 403,
  },
  "window-closed": {
    message: `The ${REFUND_WINDOW_DAYS}-day window has closed.`,
    status: 403,
  },
  "too-much-completed": {
    message: "You have completed too much of this course to request a refund.",
    status: 403,
  },
  "too-much-watched": {
    message: "You have watched too much of this course to request a refund.",
    status: 403,
  },
  "seat-claimed": {
    message:
      "A Seat on this purchase has been claimed, so it can't be refunded.",
    status: 403,
  },
};

const refundParamsSchema = z.object({
  slug: z.string().min(1),
});

// The purchase the Refund Request is for, named by the form so that a Buyer
// with several purchases of one course gets the one they asked about.
const refundPurchaseSchema = z.object({
  purchaseId: z.coerce.number().int().positive(),
});

const refundActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

function getCourseBySlug(slug: string) {
  return db.select().from(courses).where(eq(courses.slug, slug)).get();
}

function getBuyerPurchase(
  purchaseId: number,
  userId: number,
  courseId: number
) {
  return db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.id, purchaseId),
        eq(purchases.userId, userId),
        eq(purchases.courseId, courseId)
      )
    )
    .get();
}

/**
 * The confirmation the buyer gets in their inbox. There is no mail
 * transport wired up yet, so the built message goes to the server log.
 */
function buildRefundRequestEmail(input: {
  buyerName: string;
  buyerEmail: string;
  courseTitle: string;
  purchasedAt: string;
  amount: number;
}) {
  return {
    to: input.buyerEmail,
    subject: `Refund requested — ${input.courseTitle}`,
    body: [
      `Hi ${input.buyerName},`,
      "",
      `We have your Refund Request for "${input.courseTitle}", for your purchase on ${new Date(input.purchasedAt).toLocaleDateString()}.`,
      `The Refund is for ${formatPrice(input.amount)}, the amount you paid.`,
      "",
      "Our team reviews every Refund Request by hand. You do not need to do anything else — we will email you again when it is done.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to request a refund.", { status: 401 });
  }

  const { slug } = parseParams(params, refundParamsSchema);
  const course = getCourseBySlug(slug);

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const buyer = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!buyer) {
    throw data("User not found", { status: 404 });
  }

  const formData = await request.formData();
  const purchaseChoice = parseFormData(formData, refundPurchaseSchema);

  if (!purchaseChoice.success) {
    throw data("Choose the purchase you want refunded.", { status: 400 });
  }

  const purchase = getBuyerPurchase(
    purchaseChoice.data.purchaseId,
    currentUserId,
    course.id
  );

  if (!purchase) {
    throw data("That purchase is not one of yours for this course.", {
      status: 403,
    });
  }

  const eligibility = getRefundEligibility(purchase, currentUserId, course.id);

  if (!eligibility.eligible) {
    const { message, status } = INELIGIBLE_RESPONSES[eligibility.reason];
    throw data(message, { status });
  }

  const parsed = parseFormData(formData, refundActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  db
    .insert(refunds)
    .values({
      purchaseId: purchase.id,
      status: RefundStatus.Requested,
      reason: parsed.data.reason,
    })
    .returning()
    .get();

  const email = buildRefundRequestEmail({
    buyerName: buyer.name,
    buyerEmail: buyer.email,
    courseTitle: course.title,
    purchasedAt: purchase.createdAt,
    amount: purchase.amountPaid,
  });

  console.log(
    `[email] to=${email.to} subject=${email.subject}\n${email.body}`
  );

  // A Team Purchase's Buyer asked from /team, so that is where they go back.
  return redirect(
    isTeamPurchase(getSeatCounts(purchase.id)) ? "/team" : "/settings"
  );
}

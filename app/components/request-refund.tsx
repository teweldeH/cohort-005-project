import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { formatPrice } from "~/lib/utils";

/**
 * The Buyer's way to raise a Refund Request for one purchase, folded away
 * behind a button until they ask for it.
 */
export function RequestRefund({
  slug,
  offer,
}: {
  slug: string;
  offer: { purchaseId: number; purchasedAt: string; amount: number };
}) {
  const fetcher = useFetcher<{ errors?: Record<string, string> }>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    const firstError = Object.values(fetcher.data?.errors ?? {})[0];
    if (fetcher.state === "idle" && firstError) {
      toast.error(firstError);
    }
  }, [fetcher.state, fetcher.data]);

  if (!isFormOpen) {
    return (
      <div className="border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => setIsFormOpen(true)}
        >
          Request a refund
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t pt-4">
      <p className="mb-2 text-sm font-medium">Request a refund</p>
      <p className="mb-3 text-xs text-muted-foreground">
        For your purchase on {new Date(offer.purchasedAt).toLocaleDateString()}.
        We will send {formatPrice(offer.amount)} back to the card you paid with,
        once someone has read your note.
      </p>
      <fetcher.Form
        method="post"
        action={`/courses/${slug}/refund`}
        className="space-y-2"
      >
        <input type="hidden" name="purchaseId" value={offer.purchaseId} />
        <Textarea
          name="reason"
          rows={3}
          required
          placeholder="What went wrong?"
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Request a refund"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsFormOpen(false)}
          >
            Keep it
          </Button>
        </div>
      </fetcher.Form>
    </div>
  );
}

import { ShieldAlert } from "lucide-react";
import { countryName } from "~/lib/ppp";

/**
 * Why a Student who bought at a purchase-country discount can't take the
 * course from where they are now. Shown wherever the course is locked to them.
 */
export function PurchaseCountryNotice({
  purchaseCountry,
  currentCountry,
}: {
  purchaseCountry: string;
  currentCountry: string;
}) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <ShieldAlert className="size-4 text-amber-500" />
        Not available from this country
      </div>
      <p className="mb-2 text-muted-foreground">
        You bought this course with a purchase-country discount in{" "}
        <strong>{countryName(purchaseCountry)}</strong>, but you're in{" "}
        <strong>{countryName(currentCountry)}</strong> now.
      </p>
      <p className="text-muted-foreground">
        A course bought at a discount can only be taken from the country it was
        bought in.
      </p>
    </div>
  );
}

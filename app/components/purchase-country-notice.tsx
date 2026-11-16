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
        Access Restricted
      </div>
      <p className="mb-2 text-muted-foreground">
        You purchased this course with a Purchasing Power Parity discount while
        in <strong>{countryName(purchaseCountry)}</strong>, but you're currently
        accessing from <strong>{countryName(currentCountry)}</strong>.
      </p>
      <p className="text-muted-foreground">
        PPP-discounted courses can only be accessed from the country where the
        purchase was made.
      </p>
    </div>
  );
}

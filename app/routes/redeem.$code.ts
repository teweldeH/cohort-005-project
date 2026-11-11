import { redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/redeem.$code";
import { parseParams } from "~/lib/validation";

const redeemParamsSchema = z.object({
  code: z.string().min(1),
});

// Seat links used to live at /redeem/:code. Buyers have already shared some,
// so keep them working.
export function loader({ params }: Route.LoaderArgs) {
  const { code } = parseParams(params, redeemParamsSchema);
  throw redirect(`/claim/${encodeURIComponent(code)}`, 301);
}

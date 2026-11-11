import { redirect } from "react-router";
import type { Route } from "./+types/redeem.$code";

// Seat links used to live at /redeem/:code. Buyers have already shared some,
// so keep them working.
export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/claim/${encodeURIComponent(params.code)}`, 301);
}

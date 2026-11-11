# Keep the `/courses/:slug/refund` URL

The action that raises a Refund Request stays at `/courses/:slug/refund`
rather than being renamed to `/courses/:slug/refund-request` (#1). Only the
"Request a refund" form posts to it. No Buyer ever sees the URL or navigates to
it, so renaming it would change no copy and only add churn. The Buyer-facing
words are already right: they "request a refund".

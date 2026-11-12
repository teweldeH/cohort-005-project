# Choosing a notification vendor for Cadence v1 Notifications

Research for [#31](https://github.com/teweldeH/cohort-005-project/issues/31), part of the Notifications map [#23](https://github.com/teweldeH/cohort-005-project/issues/23). The recipient rules come from [#25](https://github.com/teweldeH/cohort-005-project/issues/25).

- **Checked:** 2026-11-13. All pricing and plan limits were read from the vendors' public pricing pages on that date.
- **Sources:** official docs, pricing pages, API references (OpenAPI pages), the npm registry and GitHub. Each claim links its source. Anything marked **Unverified** is an inference or isn't stated in a primary source.

## Recommendation

**Use Novu (Novu Cloud, Pro plan). Knock is the runner-up.**

Novu is the only vendor whose documented server API meets the hard requirement directly. Cadence sets its own `transactionId` when it triggers, so one call to `DELETE /v1/messages/transaction/{transactionId}` **hard-deletes** every message from that trigger. A second call to cancel the trigger stops any email that is still waiting. Novu also documents the "email only if the in-app Notification is still unread after a delay" pattern. It's the cheapest option at our volume (about $30–40 a month), it hosts in the US or EU, and its core, including the Inbox, is MIT-licensed and self-hostable. That gives us an exit path that no other vendor here offers.

Knock is the more polished product. It has a richer preference model (per-object preferences for muting a thread, plus a hosted preference page), keeps feed items indefinitely and signs user tokens with an expiring RS256 JWT. But withdrawal in Knock means **archiving**, not deleting. Archiving is a soft hide, done in bulk by `trigger_data` as an asynchronous job. Knock also costs about $250 a month at our volume, hosts in the US only (EU "by end of 2026"), and can't be self-hosted.

What to accept with Novu (these feed other tickets):

1. **Inbox retention is capped by plan**: 30 days on Free, 90 days on Pro and Team. It can only be custom on Enterprise. Notifications older than 90 days will disappear.
2. **Inbox auth is a static HMAC** of the subscriber id, not an expiring token. It stops one user from reading another's feed, but it can't be revoked per session.
3. **The Free plan allows only 5 workflows.** Pro allows 20.

## Comparison

`✅` = documented, `⚠️` = partly met or needs a workaround, `❌` = not offered or not found.

| Question | **Novu** | **Knock** | **Courier** | **MagicBell** | **SuprSend** |
|---|---|---|---|---|---|
| **React inbox under RR framework mode / SSR** | ✅ `@novu/react` 3.19 (React 18/19). Client-side component. Docs show `routerPush` wired to React Router | ✅ `@knocklabs/react` 0.15 (React 17–19). Client-side | ✅ `@trycourier/courier-react` 9.3 (React ≥18). "Render client-side only" | ⚠️ `@magicbell/magicbell-react` 11.5 (React ≥18.3.1). SSR not documented | ✅ `@suprsend/react` 1.5. SSR not documented |
| **Theming** | Appearance keys, CSS variables, light/dark | `--rnf-*` CSS variables, `colorMode` dark | Theme objects, light/dark | Not checked | Themes and CSS overrides |
| **Real-time with no server work from us** | ✅ Vendor socket | ✅ Vendor WebSocket (badge-count events) | ✅ Vendor WebSocket (`listenForUpdates()`) | ✅ (Unverified detail) | ✅ |
| **Read / unread / mark all read** | ✅ read, unread, mark all read, archive, snooze | ✅ read/unread, seen/unseen, archive (single and batch). Mark-all is a bulk channel job | ✅ read, unread, `readAll` (client SDK) | ✅ read, unread, mark all read (User JWT) | ✅ read, unread, archive |
| **Group per thread** | ✅ Digest step (group by key) | ✅ Batch function, `batch_key` = `data.thread_id` | ✅ Batch / Digest journey nodes | ⚠️ Not found | ✅ Batch node |
| **Withdraw after send (HARD REQUIREMENT)** | ✅ **Hard delete** by our own `transactionId` (`DELETE /v1/messages/transaction/{id}`) or per message. Delete-all per subscriber with a `data` filter. Cancel any pending steps by `transactionId` | ⚠️→✅ **Archive** (soft hide). `POST /v1/channels/{id}/messages/bulk/archive` filtered by `trigger_data`, async job. Pending steps cancelled by `cancellation_key` | ❌ **No documented server API.** Archiving an inbox message is a client-SDK action with a user JWT. The REST "Archive message" only hides the send request in logs. `expiresAt` at send time only | ⚠️ **Archive only**, through endpoints that take a **User JWT** (backend can mint one with HS256). No delete in API v2. No way to recall a broadcast | ⚠️ **Archive** by `message_id` via `PATCH /v1/bulk/message/`. Find ids with List Messages by `idempotency_key`. No delete. Whether archive hides from the UI is unverified |
| **Email, delayed, sent only if still unread** | ✅ In-app → Delay → Email, with condition `steps.<inapp>.read == false` | ✅ Delay plus a step condition on in-app message status (seen/read) | ⚠️ Journey: delay plus a branch on `send_status.<node>`. Whether an inbox "read" maps to a status is unverified | ⚠️ Workflow wait plus `if`. A condition on read state is not documented | ⚠️ Smart Channel Routing sends Inbox and Email together at T+0 unless "Must-Send-To" is configured |
| **Preferences (per kind, per thread mute)** | ✅ Per workflow and channel. Inbox has a built-in Preferences view. ⚠️ No native per-thread mute | ✅ Per workflow, category and channel, plus per-object preferences (thread mute). Hosted preference page | ✅ Topics and channels. `<CourierPreferences />` component | ⚠️ Channel preferences per category. UI not checked | ✅ Categories and channels. Preference-centre SDK |
| **Retention** | ⚠️ Inbox: 30 days (Free), 90 days (Pro/Team), custom (Enterprise). Not configurable below Enterprise | ✅ Feed items kept **indefinitely**. Logs 30 days (90 on Enterprise) | Until archived or `expiresAt`. No stated limit | Not stated | Per-message expiry (auto-delete). Logs 30 days (Free), 90 days (paid) |
| **Identity and inbox auth** | Any string `subscriberId` (our numeric id as a string). HMAC-SHA256(secret, subscriberId), static | Any string user id. Signed user token RS256 JWT (`sub`, `exp`) in "enhanced security mode" | User id string. Backend-minted scoped JWT (`user_id:… inbox:read:messages`, `expires_in`) | `user_external_id`. HS256 User JWT signed with the project secret | `distinct_id`. ES256 signed user JWT |
| **Data hosting** | US (Virginia) or EU (Frankfurt), chosen when the account is created | **US only** (AWS). EU "by end of 2026" | US. EU residency on the Business plan | Not stated | US or EU (SaaS). BYOC/VPC on Enterprise |
| **Free dev tier** | ✅ 10k workflow runs per month, 5 workflows | ✅ 10k messages per month | ✅ 10k sends per month | ⚠️ 1k deliveries per month | ✅ 10k notifications per month |
| **Est. cost at ~10k recipients** (assumptions below) | **≈ $30–40 per month** (Pro, 30k runs included, then $1.20 per 1k) | **≈ $250 per month** (Starter, 50k messages) | **≈ $150–200 per month** ($0.005 per send) | **≈ $249 per month** (Startup, 50k deliveries) | **≈ $100–250 per month** (Essentials or Business, 50k) |
| **Self-host or export path** | ✅ **Open core (MIT), self-hostable** including Inbox, digest and preferences | ⚠️ **No self-host.** Export through the API (List Messages) or warehouse sync (Enterprise) | 🚩 **No self-host.** API export only | 🚩 **No self-host.** API export only | ⚠️ Self-host and BYOC on **Enterprise only** |
| **Node server SDK** | ✅ `@novu/api` 3.19 | ✅ `@knocklabs/node` 1.41 | ✅ `@trycourier/courier` 10.0 | ✅ `magicbell-js` 1.8 | ✅ `@suprsend/node-sdk` 1.15 |

**Cost assumptions (rough).** About 10k recipients a month, averaging 3 Notifications each, gives about 30k in-app messages. If about a third of those go unread long enough to send an email, that adds about 10k emails, for about 40k channel messages.

The vendors bill different units:

- Novu bills **workflow runs**, one per subscriber per trigger, so about 30k.
- Courier bills **sends**, where one template to one recipient counts once across channels, so about 30k–40k. Whether a journey with two send nodes counts as two sends is unverified.
- Knock, MagicBell and SuprSend bill **per channel message**, so about 40k.

None of these figures include the email provider's own bill. Knock, for example, says providers such as Postmark are billed separately.

## Withdrawal in detail (the hard requirement)

The rule from #25: when a Comment is deleted, its Notifications are "removed from the bell and no longer counted as unread".

- **Novu.** Trigger each Comment's workflow with `transactionId = "comment-<id>"`. A single trigger can fan out to up to 100 recipients, all sharing that transactionId. When the Comment is deleted:
  1. `DELETE /v1/messages/transaction/comment-<id>`, optionally with `?channel=in_app`, hard-deletes the messages. The docs call it "irreversible".
  2. "Cancel triggered event" with the same transactionId stops any pending delay or email.

  A subscriber-scoped "Delete all notifications" with a `data` JSON filter also exists as a fallback. **Unverified:** that an open Inbox drops the deleted item and updates its counts live, without a refresh.
- **Knock.** Trigger with `cancellation_key = "comment-<id>"` and put `comment_id` in `data`. When the Comment is deleted:
  1. Cancel the workflow. This only stops runs paused at a delay, batch or wait step, and it is queued.
  2. Bulk-archive the in-app channel's messages filtered by `trigger_data`. This returns a `BulkOperation` with status "processing", so it is asynchronous.

  Knock's own cancel docs recommend archiving to revoke in-app messages. Archived items are hidden from the default feed. **Unverified:** that archived items are excluded from `unread_count` and `unseen_count`. The docs imply it but don't state it.
- **Courier.** No REST endpoint archives or deletes another user's inbox message. Search engines still index an older "Delete an inbox message" API page, but it now returns 404. A possible workaround: the backend mints a JWT for each recipient and calls the inbox archive action as that user. **Unverified**, and fragile.
- **MagicBell.** API v2 has archive endpoints for a single notification and for "archive all by category/topic", but only with a **User JWT**. The backend can mint one, since it's HS256 with the project secret, but that means one call per recipient. There's no delete in v2, and no way to recall a broadcast.
- **SuprSend.** Look up messages by `idempotency_key`, then `PATCH /v1/bulk/message/` with `action: "archived"` (up to 1000 per call). No delete action exists. **Unverified:** that archived items leave the inbox UI and its counts.

## Surprises that affect other tickets

- **Retention (map: "Not yet specified").** Under Novu, Notifications disappear after 90 days on Pro/Team (30 days on Free) unless we buy Enterprise. Knock keeps feed items indefinitely. The vendor choice therefore effectively decides the retention ticket.
- **Grouping and withdrawal clash.** Every vendor groups by merging events into **one message**: Novu Digest, Knock Batch (`batch_key = thread_id`), Courier and SuprSend Batch. If a Comment inside a grouped Notification is deleted, we can only withdraw the whole grouped message. We can't drop one Reply from it. Either v1 skips grouping or #25's withdrawal rule needs a caveat.
- **Delay-if-unread is first-class only in Novu and Knock.** Both key it on the in-app message's read (or seen) state. Novu runs: in-app step → Delay → Email with `steps.<id>.read == false`. Knock runs: delay → step condition. In SuprSend, Inbox and the first email go out together by default.
- **Per-thread muting is native only in Knock** (per-object preferences). With Novu, Cadence would store thread mutes itself and leave muted users out of recipients, which fits "Cadence decides recipients" anyway. Per-kind opt-out (one workflow per kind) and a built-in preferences UI work in all five.
- **Inbox auth differs a lot.** Novu's HMAC hash never expires. Knock, Courier and SuprSend use expiring JWTs. Either way Cadence must add a server-side step (a loader) that produces the hash or token for the session user. That belongs in the "identifying users to the vendor" seam.
- **Lapsed or PPP-blocked recipients.** No vendor knows about Cadence course access. Cadence must filter recipients before triggering (already decided in #25). Existing Notifications stay visible after access is lost unless we withdraw them.
- **Novu Free tier: 5 workflows, 2 environments.** Enough for the comment loop (Question, Reply), but the Refund Request and Seat triggers will likely push us onto Pro (20 workflows).

## Sources

### Novu

- Pricing: https://novu.co/pricing
- Retention and regions: https://docs.novu.co/platform/additional-resources/security
- Delete messages by transactionId: https://docs.novu.co/api-reference/messages/delete-messages-by-transactionid
- Delete a message: https://docs.novu.co/api-reference/messages/delete-a-message
- Delete all notifications (subscriber, filters): https://docs.novu.co/api-reference/subscribers/delete-all-notifications
- Cancel triggered event: https://docs.novu.co/api-reference/events/cancel-triggered-event
- API index (read, unread, mark all read, archive, snooze): https://docs.novu.co/_llms/api-reference.txt
- Step conditions (skip email when in-app read): https://docs.novu.co/platform/workflow/add-and-configure-steps/step-conditions
- Usage (workflow runs vs messages): https://docs.novu.co/platform/workflow/usage
- HMAC: https://docs.novu.co/platform/inbox/prepare-for-production
- React quickstart (React Router `routerPush`): https://docs.novu.co/platform/quickstart/react
- Self-hosted vs Cloud: https://docs.novu.co/community/self-hosted-and-novu-cloud
- License (MIT core, `/enterprise` commercial): https://github.com/novuhq/novu (README, "License")

### Knock

- Pricing: https://knock.app/pricing
- Messages API: https://docs.knock.app/api-reference/messages
- List messages (filter by `trigger_data`, `workflow_run_id`): https://docs.knock.app/api-reference/messages/list
- Bulk update channel messages: https://docs.knock.app/api-reference/channels/bulk/update_message_status
- Canceling workflows: https://docs.knock.app/send-notifications/canceling-workflows
- Message statuses: https://docs.knock.app/send-notifications/message-statuses
- Step conditions: https://docs.knock.app/designing-workflows/step-conditions
- Batch function: https://docs.knock.app/designing-workflows/batch-function
- Preferences: https://docs.knock.app/preferences/overview
- Data retention: https://docs.knock.app/manage-your-account/data-retention
- Security and authentication: https://docs.knock.app/in-app-ui/security-and-authentication
- React feed: https://docs.knock.app/in-app-ui/react/feed
- In-app API and real-time: https://docs.knock.app/in-app-ui/api-overview
- Plans (EU residency roadmap): https://docs.knock.app/manage-your-account/knock-plans
- Subprocessors (AWS, USA): https://knock.app/legal/subprocessors
- Data warehouse sync: https://knock.app/changelog/2023-07-05

### Courier

- Pricing: https://www.courier.com/pricing
- API reference index (no inbox delete endpoint): https://www.courier.com/docs/_llms/api-reference.txt
- Archive message (send request, not inbox): https://www.courier.com/docs/api-reference/messages/archive-message
- Inbox runtime behaviour (real-time, retention): https://www.courier.com/docs/in-app/how-the-inbox-behaves
- JS SDK inbox actions: https://www.courier.com/docs/sdk-libraries/courier-js-web
- React SDK: https://www.courier.com/docs/sdk-libraries/courier-react-web
- JWT auth: https://www.courier.com/docs/in-app/authenticate-users
- Journey branch node: https://www.courier.com/docs/journeys/nodes/branch
- Delay and schedule: https://www.courier.com/docs/send/delay-and-schedule

### MagicBell

- Pricing: https://www.magicbell.com/pricing
- API v2 reference: https://www.magicbell.com/docs/api/reference
- User JWT: https://www.magicbell.com/docs/api/authentication/user
- Notification primitive: https://www.magicbell.com/docs/primitive/notification

### SuprSend

- Pricing: https://www.suprsend.com/pricing
- Bulk update messages: https://docs.suprsend.com/reference/bulk-update-messages
- List messages (`idempotency_key` filter): https://docs.suprsend.com/reference/list-messages
- Inbox template (expiry): https://docs.suprsend.com/docs/in-app-inbox-template
- Inbox overview: https://docs.suprsend.com/docs/inbox-overview
- Client authentication (ES256 JWT): https://docs.suprsend.com/docs/client-authentication
- Smart Channel Routing: https://docs.suprsend.com/docs/smart-delivery
- Delay: https://docs.suprsend.com/docs/delay
- Security (EU residency): https://docs.suprsend.com/docs/security
- React SDK: https://docs.suprsend.com/docs/react-inbox-integration

### npm (versions and React peer ranges, checked 2026-11-13)

`@novu/react`, `@novu/api`, `@knocklabs/react`, `@knocklabs/node`, `@trycourier/courier-react`, `@trycourier/courier`, `@magicbell/magicbell-react`, `magicbell-js`, `@suprsend/react`, `@suprsend/node-sdk`, all checked with `npm view <pkg> version peerDependencies`.

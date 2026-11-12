# Live-update options for Notifications on this stack

Research for [#24](https://github.com/teweldeH/cohort-005-project/issues/24), part of the Notifications v1 map ([#23](https://github.com/teweldeH/cohort-005-project/issues/23)).

**Question:** how do we get a new Notification in front of someone on the site within about a minute? The stack is React Router framework mode, one SQLite file through Drizzle, and one Node server. The three candidates are polling (revalidation or a fetcher), Server-Sent Events (SSE) from a resource route, and WebSockets.

**Recommendation:** poll a small resource route with `useFetcher().load()` every 30 seconds while the tab is visible. Also poll straight away when the tab regains focus or becomes visible. SSE works on this stack and is the upgrade path if we need second-level latency later. WebSockets would need a custom server, which this promise does not justify.

## The stack as it actually is

Checked in the repo on 2026-11-13.

| Fact | Where it comes from |
| --- | --- |
| `react-router`, `@react-router/node`, `@react-router/serve` and `@react-router/dev` are all **8.3.0**, used in framework mode with `ssr: true` | `package.json`, `react-router.config.ts` |
| Production runs `react-router-serve ./build/server/index.js`. There is no custom server file. | `package.json` `scripts.start` |
| `react-router-serve` is Express 5 with `compression()`, static file serving and morgan, then one catch-all `createRequestHandler`. It does not let you get at the `http.Server` or add `upgrade` handlers. | `node_modules/@react-router/serve/dist/cli.js` |
| Data is one SQLite file (`data.db`, WAL mode) opened lazily through `better-sqlite3`. The app is one process and cannot run on more than one machine. | `app/db/index.ts`, `docs/adr/0006-one-sqlite-file-through-drizzle.md` |
| Sessions are stored in cookies (`createCookieSessionStorage`), so the server keeps no session state | `app/lib/session.ts` |
| Every signed-in page sits under the `routes/layout.app.tsx` layout, which is where a bell would go | `app/routes.ts` |

## Option 1: Polling

### How it works in React Router

There are two ways to do it.

- **`useRevalidator()`** re-runs the loaders of **every route on the current page**. The docs list "polling on an interval" and window focus as its intended uses ([React Router: useRevalidator](https://reactrouter.com/api/hooks/useRevalidator)). The cost is that every poll reloads everything on the page: a lesson page, an analytics page, a refunds table. Each one re-renders, just to update one number.
- **`useFetcher().load(href)` on a resource route.** This is the better fit. A resource route is a route module "that exports a loader or action but does not export a default component" ([React Router: Resource Routes](https://reactrouter.com/how-to/resource-routes)). Here that would be something like `api.notifications.ts`, returning `{ unreadCount, latest }`. The bell in `layout.app.tsx` holds a fetcher and calls `fetcher.load("/api/notifications")` on a `setInterval`. It also calls it on `visibilitychange` and `focus`, and skips polls while `document.hidden`. Only that one loader runs.

The bell still gets updated through normal navigation as well: an action submitted through `<Form>`/`useFetcher` "still revalidates matched UI loaders" (same resource-routes page). So the layout loader can also return the count on first render.

### Server and connection cost

Each open, visible tab makes one short HTTP request per interval. At 30 seconds that is 2 requests per minute per tab. Each request does a cookie session decode and one indexed `SELECT count(*) … WHERE recipient_id = ? AND read_at IS NULL` on a synchronous, local SQLite connection: no network round trip (ADR 0006). No connection stays open between polls. The response goes through the normal `compression()` path.

### Behaviour across deploys and restarts

Nothing is lost. Each poll stands alone, so a restart only causes the polls during the downtime to fail. The next poll after the restart catches up, because the Notifications are rows in SQLite, not messages held in memory. The fetcher's `data` keeps its last value while a load fails, so the bell does not flash empty.

### Complexity

This is the lowest of the three: one resource route, one hook in the layout, and no new dependencies or server code. Worst-case latency is the interval. Average latency is about half the interval, plus the immediate poll when the tab regains focus. That meets "within about a minute" with room to spare.

## Option 2: Server-Sent Events from a resource route

### How it works in React Router

A resource route `loader` returns `new Response(stream, { headers: { "Content-Type": "text/event-stream" } })`, where `stream` is a `ReadableStream` the server writes `data: …\n\n` frames into. On the client, the bell opens `new EventSource("/api/notifications/stream")` in a `useEffect`. Each message either updates local state or calls `useRevalidator().revalidate()`.

I checked that this works under `react-router-serve` as installed:

- `@react-router/express` calls `res.flushHeaders()` when the response `Content-Type` matches `text/event-stream` (`node_modules/@react-router/express/dist/index.js`, `sendRemixResponse`).
- `writeReadableStreamToWritable` calls `writable.flush()` after **every chunk** if it exists (`node_modules/@react-router/node/dist/index.js`). `compression` (v1.8.2) adds `res.flush()` (`node_modules/compression/index.js`). So the gzip middleware does not hold frames back.
- The adapter aborts `request.signal` on `res.on("close")` (`createRemixRequest`), so the loader can clean up its subscription when the tab closes.

The server needs to know when to push. With one process (ADR 0006), an in-memory `EventEmitter` keyed by user ID is enough: the code that inserts a Notification emits, and each open stream listens. This would break if the app ever ran more than one process. You would then need SQLite polling inside the stream or a pub/sub service.

### Server and connection cost

Each open tab holds one long-lived HTTP connection and one listener. When idle there is almost no CPU use, apart from a keep-alive comment line every 15 to 30 seconds. MDN: "a server can send a comment periodically to keep the connection alive" ([MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)).

The browser limit is the catch. MDN warns: "When **not used over HTTP/2**, SSE suffers from a limitation to the maximum number of open connections … the limit is _per browser_ and is set to a very low number (6) … marked as 'Won't fix' in Chrome and Firefox" (same page). `react-router-serve` speaks HTTP/1.1. So unless a proxy in front terminates HTTP/2, someone with six Cadence tabs open uses up every connection to the site, and normal navigation stalls. You can work around it, for example with one stream per browser shared through a `BroadcastChannel` or `SharedWorker`, but that adds complexity.

### Behaviour across deploys and restarts

`EventSource` reconnects automatically: "if the connection between the client and server closes, the connection is restarted". The server can set the delay with a `retry:` field (MDN). Anything emitted while the client was disconnected is missed by the in-memory emitter. So the stream must send the current unread count on every connect, or use `id:` and `Last-Event-ID` to resume. Because the data lives in SQLite, sending the current state on connect is easy. During a restart, every open tab reconnects at about the same moment.

### Complexity

Medium. You need the stream route, the emitter, cleanup on abort, keep-alives, a resync on connect and a guard against too many tabs. All of it fits inside `react-router-serve`, with no custom server.

## Option 3: WebSockets

### How it works in React Router

React Router has no WebSocket API. Routes handle `Request`s and return `Response`s. A WebSocket needs an HTTP `Upgrade` handled on the Node `http.Server` itself, usually with the `ws` package (not installed). `react-router-serve` creates the server inside `app.listen(...)` and never exposes it (see `cli.js` above). So this option means:

1. Replacing `react-router-serve` with a custom `server.ts`: Express plus `@react-router/express` `createRequestHandler`, plus `ws` attached to the server's `upgrade` event.
2. Doing the same in development, where `react-router dev` owns the Vite server. You would run Vite in middleware mode inside the custom server.
3. Authenticating the upgrade request yourself, by parsing the `cadence_session` cookie outside React Router's loaders.
4. A client-side socket manager with reconnect and backoff. Browsers do not reconnect WebSockets automatically.

### Server and connection cost

Each tab holds one persistent connection, much like SSE. WebSockets are not subject to the HTTP/1.1 limit of six connections per host, which is their one real advantage here. The two-way channel is not needed: Notifications only travel from server to client, and marking one read is an ordinary action.

### Behaviour across deploys and restarts

Every socket drops on restart. The client must reconnect, which you write yourself, and resync from SQLite. In-memory fan-out has the same single-process limit as SSE.

### Complexity

This is the highest of the three. It replaces the documented production entry point, changes the dev server, and adds a dependency plus a separate auth path. That is a large structural change for a one-way notification feed with a one-minute promise.

## Comparison

| | Polling (fetcher + resource route) | SSE (resource route) | WebSockets |
| --- | --- | --- | --- |
| Latency | ≤ interval (30 s); immediate on focus | Under a second | Under a second |
| Fits `react-router-serve` as is | Yes | Yes (flush and abort verified in the adapter) | No: needs a custom server |
| Connections held open | None | 1 per tab (6 per browser on HTTP/1.1) | 1 per tab |
| Server cost when idle | 2 cheap SQLite reads per tab per minute | ~0, apart from keep-alive comments | ~0, apart from pings |
| Deploy or restart | Nothing to do; next poll catches up | Automatic reconnect; must resync on connect | Hand-written reconnect plus resync |
| Multi-process ready | Yes (stateless) | No (in-memory emitter) | No (in-memory emitter) |
| New dependencies | None | None | `ws`, custom server, dev-server changes |
| Complexity | Low | Medium | High |

## Recommendation

**Polling with `useFetcher().load()` against a dedicated resource route,** every 30 seconds while the tab is visible, plus an immediate load on `focus` and `visibilitychange`. It meets the "within about a minute" promise and needs no server changes. It survives restarts with no extra code and stays stateless, so it does not add to the single-process limit in ADR 0006. Do not use `useRevalidator` for the interval, because it re-runs every loader on the page.

Keep the resource route's response shape (`unreadCount` plus the latest few Notifications) independent of how it is delivered. If the promise later becomes "instantly", an SSE stream at a sibling route can push the same shape without a custom server. Before adopting SSE, solve the HTTP/1.1 six-connection limit, either with HTTP/2 at a proxy or with one shared stream per browser.

## Sources

- React Router, `useRevalidator`: https://reactrouter.com/api/hooks/useRevalidator
- React Router, Resource Routes: https://reactrouter.com/how-to/resource-routes
- MDN, Using server-sent events: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- Installed source (v8.3.0): `node_modules/@react-router/serve/dist/cli.js`, `node_modules/@react-router/express/dist/index.js`, `node_modules/@react-router/node/dist/index.js`, `node_modules/compression/index.js` (v1.8.2)
- Repo: `package.json`, `react-router.config.ts`, `app/db/index.ts`, `app/lib/session.ts`, `app/routes.ts`, `docs/adr/0006-one-sqlite-file-through-drizzle.md`

# Coding standards

Read by the Standards reviewer. Formatting is Prettier's job and mechanical
syntax rules belong to the linter, so neither is repeated here.

## Data

- Two writes that must both land go in a transaction. (Refund approved, enrollment never ended.)
- Store money as integer cents. (Regional prices came out as `19.990000000000002`.)
- Store timestamps as ISO strings in UTC. (Refund window closed a day early in Sydney.)
- A status the code compares against is an enum in `app/db/schema.ts`. (`"pending"` vs `"Pending"`.)
- Soft-delete anything another row or a link points at. (Deleting a lesson took learners' notes.)
- Index every foreign key in the change that adds it.
- Paginate any query whose row count grows with the product's age. (Students page timed out.)
- No query inside a loop: join, or one query with `IN`. (Notes loader: one query per lesson.)
- Select the columns you need.
- Migrations are forward-only.

## Routes and modules

- A loader or action that can't continue throws a response (`throw data(…, { status })`).
- Parse form data, search params and bodies with zod once, at the edge. `Number("")` is `0`. (An empty `lessonId` opened lesson 0.)
- Check permission in the action as well as the loader. (Anyone signed in could approve refunds.)
- Once a module owns a feature's data, the route gets it from the module, not `~/db`. Import modules only through their root entry points ([app/modules/README.md](./app/modules/README.md)).
- Secrets live only in `.server.ts` code and never reach a log line.
- Render `marked` output only after DOMPurify.

## Code

- Derive a value you can compute from state you already hold. Don't store it.
- Rendering computes output. Side effects go in an effect or an action.
- Copy a value you were handed before changing it.
- A `mode` flag or a `variant` that changes _what_ renders is two functions or two components.
- A required argument has no default value.
- Take the clock as an argument instead of calling `Date.now()`. (Refund tests failed at midnight.)
- Catch the narrowest error you can, and log the error object, not just the message.
- Booleans read as questions: `isPublished`, `hasSeats`, `canRefund`.
- Comments explain _why_ (a constraint, a decision, an ADR link), never _what_.
- Inline `style` only for computed values.
- Colour is never the only signal.

## Tests

- Name a test for the behaviour: "refuses a refund after the window closes".
- Arrange through the module's own functions. Add one when it's missing instead of inserting rows.
- Mock only what you don't own. Keep fixtures next to the test that uses them.

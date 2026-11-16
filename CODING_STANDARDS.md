# Coding standards

When existing code disagrees with this file, this file wins. Flag the
existing code as debt; do not copy it into new code.

## Fail with a thrown response, not a return value

A loader or an action that cannot continue throws. It does not return an
error shape for the component to unpack.

```ts
if (!course) throw data("Course not found", { status: 404 });
```

The route then has one success path. A returned error shape gives every
component a second path to forget about.

## Parse untrusted input with a schema

Form data, search parameters and request bodies get a zod schema before the
values reach any query. Do not read `formData.get("x") as string`. The cast
is a lie the type checker believes.

## Do not write `any`, and do not write `!`

Both switch the type checker off at the exact point you are least sure. If a
value can be missing, narrow it with a check. If you cannot name the type,
the shape is wrong — fix the shape.

## Domain logic lives in a service

A service is a factory that takes its dependencies once and returns the
operations, named for what they do to the domain:

```ts
export function createNotesService(db: Db) {
  return { get, save, listForStudent };
}
```

Routes create the service and call it. Do not export a loose set of
functions that each take `db` first.

## Let the code explain itself; comment only the why

Name functions, variables and types so the code reads without help. A
comment earns its place by saying something the code cannot: a reason, a
constraint, a gotcha ("the unique index makes this insert race-safe").

Do not restate GLOSSARY.md, describe what a function does, or add section
banners. Those comments go stale the first time the code changes.

## Tests arrange state through the app's own functions

Set up test data with the `~/test/setup` helpers and the services under
test, not with `db.insert(schema.x)`. Raw inserts duplicate the app's rules
and drift from them, and they tie the test to the storage layer. When a
helper is missing, add it to `~/test/setup`.

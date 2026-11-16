# Modules

Each folder here is a **deep module**: a lot of behaviour behind a small
interface. Its root files are its entry points; everything in a subfolder is
private.

```
app/modules/
  <name>/
    index.ts          ← an entry point (public). Import this from outside.
    thing.server.ts   ← another entry point. A module may expose several.
    lib/              ← implementation: hidden from outside, free to import each other.
    tests/            ← tests and fixtures, importing only entry points.
```

Copy `example/` to start a new module.

**Expose several small entry points, not a barrel.** Don't write an `index.ts`
that re-exports a whole subtree. Give each audience its own small root file
(say, one safe for the browser and one `.server.ts`) and keep the rest in
`lib/`.

## The rules

`npm run lint:boundaries` (dependency-cruiser, configured in
`.dependency-cruiser.cjs`) fails on any of these:

1. **Entry-point boundary.** Code outside a module — routes, `app/lib`, other
   modules — imports only the module's root files, never anything in its
   subfolders.
2. **Intra-module freedom.** A module's own files import each other freely.
3. **Tests through the entry points.** Files in `<name>/tests/` import entry
   points and their own `tests/` fixtures, never any module's subfolder
   internals, not even their own. Nothing outside `tests/` imports from it.
4. **No cycles.** No dependency cycles anywhere in `app/`.

Modules are flat: one tier under `app/modules/`, and a module never contains
another module.

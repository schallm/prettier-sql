# prettier-plugin-postgresql

## 0.2.6

### Patch Changes

- fixes to COPY WHERE and JSON_OBJECTAGG / JSON_ARRAYAGG

## 0.2.5

### Patch Changes

- Minor layout fixes for compact and standard modes

## 0.2.4

### Patch Changes

- Remove extra line returns for minor statements

## 0.2.3

### Patch Changes

- Minor format changes

## 0.2.2

### Patch Changes

- Fix several compact formatting issues

## 0.2.1

### Patch Changes

- Bundle `@prettier-sql/core` into each plugin's `dist/` at build time so that npm users don't encounter an unresolvable `workspace:*` dependency. Previously, installing `prettier-plugin-tsql@0.6.1` with npm (instead of pnpm) failed because `@prettier-sql/core` is a private workspace package never published to npm. The new `bundle-core.mjs` post-build script copies the compiled core utilities into `dist/_core/` and rewrites all import paths, making each published package fully self-contained.

    Also fixes filtered-index `WHERE` predicate formatting: predicates on `CREATE INDEX … WHERE` now go through the expression printer (spaces around operators, keyword casing) instead of raw source text. Compound predicates indent correctly under `where`.

## 0.2.0

### Minor Changes

- a4b725c: Many issues found and fixed

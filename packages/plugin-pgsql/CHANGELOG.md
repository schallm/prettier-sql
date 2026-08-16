# prettier-plugin-postgresql

## 0.2.8

### Patch Changes

- d7d420a: Bump `node-api-dotnet` to 0.9.25 (was 0.9.21).

## 0.2.7

### Patch Changes

- aeb9c93: Fail loudly with a clear error instead of silently dropping SQL when the formatter hits an
  unsupported expression, FROM item, or constant kind (e.g. `COLLATE`, `IS JSON`, bit-string
  literals). Previously these cases either emitted an unhelpful `/* unknown: RawExpr */` marker
  or, for unrecognized constant kinds, vanished from the output entirely with no indication
  anything was wrong. The error message now names the specific unsupported construct and shows
  the surrounding source text.
- cfe27f7: Fix several remaining silent-data-loss fallbacks left over from the earlier
  "fail loudly" fix: `WITH cte AS (...)`, `COPY (...) TO ...`, `PREPARE ... AS ...`, and
  `EXPLAIN ...` all silently dropped their inner query when it was a writable `MERGE` (and
  `EXPLAIN` additionally for `CREATE TABLE AS`/`CREATE MATERIALIZED VIEW`, `DECLARE CURSOR`,
  `REFRESH MATERIALIZED VIEW`, and `EXECUTE`, despite formatters for all of these already
  existing). `DROP CAST`/`DROP OPERATOR CLASS`/`DROP OPERATOR FAMILY` similarly lost their
  object name. All of these now format correctly when a builder exists, or throw a clear
  "Unsupported ..." error instead of silently producing wrong SQL.

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

# prettier-plugin-tsql

## 0.7.0

### Minor Changes

- ac253f1: Add Always Encrypted support: `CREATE/DROP COLUMN MASTER KEY`, `CREATE/ALTER/DROP COLUMN
ENCRYPTION KEY`, and the column-level `ENCRYPTED WITH (COLUMN_ENCRYPTION_KEY = ...,
ENCRYPTION_TYPE = ..., ALGORITHM = ...)` clause are now parsed and reformatted structurally
  instead of being preserved as raw passthrough text.

## 0.6.7

### Patch Changes

- Update to version 180.37.3 of Microsoft.SqlServer.TransactSql.ScriptDom

## 0.6.6

### Patch Changes

- Minor layout fixes for compact and standard modes

## 0.6.5

### Patch Changes

- Remove extra line returns for minor statements

## 0.6.4

### Patch Changes

- Minor format changes

## 0.6.3

### Patch Changes

- Fix several compact formatting issues

## 0.6.2

### Patch Changes

- Bundle `@prettier-sql/core` into each plugin's `dist/` at build time so that npm users don't encounter an unresolvable `workspace:*` dependency. Previously, installing `prettier-plugin-tsql@0.6.1` with npm (instead of pnpm) failed because `@prettier-sql/core` is a private workspace package never published to npm. The new `bundle-core.mjs` post-build script copies the compiled core utilities into `dist/_core/` and rewrites all import paths, making each published package fully self-contained.

    Also fixes filtered-index `WHERE` predicate formatting: predicates on `CREATE INDEX … WHERE` now go through the expression printer (spaces around operators, keyword casing) instead of raw source text. Compound predicates indent correctly under `where`.

## 0.6.1

### Patch Changes

- Fix several data-loss bugs where input SQL was silently dropped or corrupted:
    - `MERGE TOP (N)`: the TOP clause was dropped from MERGE statements
    - Standalone `BEGIN...END` blocks: delimiters were stripped, leaving only the inner statements
    - `LEDGER = ON/OFF`: table option was corrupted to bare `ledger` (invalid SQL)
    - `BEGIN DISTRIBUTED TRANSACTION`: normalized to non-distributed form
    - `BEGIN TRANSACTION ... WITH MARK`: the MARK clause was dropped
    - XML method calls (`SET @xml.modify(...)`): statement was not printed
    - Compound assignment operators (`+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`): all collapsed to `=`
    - CLR `EXTERNAL NAME` on procedures and functions: dropped entirely
    - `ALTER EVENT SESSION ... STATE = START/STOP`: mangled by ScriptDOM fragment length bug

## 0.6.0

### Minor Changes

- a4b725c: Many issues found and fixed

## 0.5.1

### Patch Changes

- 5582509: Update repository link to monorepo

# prettier-sql — Developer Guide for Claude

## Monorepo structure

```
prettier-sql/
├── packages/
│   ├── core/            # @prettier-sql/core — shared TS + C# (private, not published)
│   ├── plugin-tsql/     # prettier-plugin-tsql (npm published)
│   └── plugin-pgsql/    # prettier-plugin-postgresql (npm published)
└── extensions/
    ├── vsix-tsql/       # VS/SSMS extension for T-SQL (Windows-only)
    └── vsix-pgsql/      # VS/SSMS extension for PostgreSQL (Windows-only)
```

Dependency graph:

```
core ──┬──> plugin-tsql ──> vsix-tsql
       └──> plugin-pgsql ──> vsix-pgsql
```

`core` has no workspace dependencies. Both plugins declare `"@prettier-sql/core": "workspace:*"`.
Both vsix packages declare their plugin via `"workspace:*"` in `bundled/package.json`.

## Build & test

```bash
# From repo root:
pnpm install              # install all workspace packages
pnpm -r build             # build all packages in dependency order
pnpm -r test              # run all test suites

# Per-package (from root):
pnpm --filter prettier-plugin-postgresql build
pnpm --filter prettier-plugin-postgresql test
pnpm --filter prettier-plugin-tsql test

# Or cd into a package and use pnpm run:
cd packages/plugin-pgsql && pnpm run build
cd packages/plugin-tsql  && pnpm run test
```

vsix packages only build on Windows (`msbuild`) — they are skipped in `pnpm -r build` on macOS/Linux.

## @prettier-sql/core

Shared code that both plugins consume. Lives at `packages/core/`.

### TypeScript exports

Sub-path exports from `packages/core/package.json`:

| Import path | Source file |
|---|---|
| `@prettier-sql/core` | `src/index.ts` (re-exports everything) |
| `@prettier-sql/core/types` | `src/types.ts` — `SqlNode`, `CommentToken` interfaces |
| `@prettier-sql/core/options` | `src/options.ts` — `sqlKeywordCase`, `sqlDensity`, `sqlCommaStyle` |
| `@prettier-sql/core/printer/utils` | `src/printer/utils.ts` — `keyword()`, `parenList()`, `aliasDoc()`, `hardSep()`, `softSep()`, `commentsBlock()`, etc. |
| `@prettier-sql/core/printer/helpers` | `src/printer/helpers.ts` — `prop()`, `propArr()`, `propStr()`, `propBool()` |

### C# — `PrettierSql.Core` namespace

`packages/core/src/dotnet/Core/PrettierSql.Core.csproj` (net8.0, no NuGet deps).
Contains `SqlNode.cs` with namespace `PrettierSql.Core`.

Both plugin csproj files reference it:
```xml
<ProjectReference Include="../../../../core/src/dotnet/Core/PrettierSql.Core.csproj" />
```

Both plugins' `AstBuilder.cs` and parser entry points (`TsqlParser.cs` / `PgsqlParser.cs`) add
`using PrettierSql.Core;`. The entry-point classes need distinct names: node-api-dotnet exposes
static classes by simple name, so two plugins loaded in one process can't both define `SqlParser`.

### Shared test fixtures

Standard SQL that both dialects must format identically:
`packages/core/tests/fixtures/shared/` — dml/ and select/ subdirectories.

Each plugin's `tests/fixtures.test.ts` runs these under a `shared fixtures` describe block
and also runs its own dialect-specific fixtures.

### Meaning check

Snapshots and idempotence can't catch output that is stable but means something else,
so every fixture also has to keep its meaning. The harness
(`packages/core/tests/fixtures-harness.ts`) takes a `canonical(sql)` function from each
plugin, formats the fixture with the default options and four non-default option sets,
and requires the canonical form of each output to equal the input's:

- **PostgreSQL** — libpg_query's parse tree as JSON without source positions, plus the
  comment texts (`PgsqlParser.Canonical`).
- **T-SQL** — ScriptDom's syntax tree walked by reflection, without positions or token
  streams, plus the comment texts (`TsqlParser.Canonical`).

Each canonical form folds in only the differences the database itself ignores — bracket
or quote style, parentheses, `ASC`, the case of built-in names, `INSERT` vs `INSERT INTO`,
and so on; see the doc comment on each `Canonical`. A failure prints both trees: find the
first differing node, and fix the builder or printer that dropped or changed it. Add a
new equivalence to `Canonical` only when the database really treats the two forms as the
same, with the reason in a comment — never to make a test pass. A fixture must parse.

## Versioning (Changesets)

Each package versions independently. When changing user-facing behavior, add a changeset:

```bash
pnpm changeset          # interactive — select packages and bump type
pnpm release            # cut a release: CI gate, merge Version Packages PR, stage, 2FA approve,
                        # and optionally publish the VS Code extension
```

`pnpm release` (`scripts/release.sh`) pushes, merges and publishes — the user runs it in
their own terminal; don't run it from an agent (use `--dry-run` to check it). See
`RELEASING.md` for what it automates.

`@prettier-sql/core` is private — it is never published to npm.

## C# project pattern

Each plugin's `src/dotnet/<Name>/<Name>.csproj` targets net8.0 and references
`PrettierSql.Core.csproj`. The build chain: `Core` compiles first; then each plugin
compiles against it. `dotnet publish` output lands in `bin/dotnet/` where node-api-dotnet
can load it.

## Pending tasks

- [x] **Publish to npm** — `prettier-plugin-postgresql` and `prettier-plugin-tsql` are live on npm (the first releases were published by hand, with what is now `pnpm release:manual`; see `RELEASING.md`).
- [x] **npmjs.org package pages** — already correct, since `package.json`'s `repository`/`homepage` fields point at the monorepo and npm derives the package page links from those at publish time (verified via `npm view <pkg> repository homepage`).
- [x] **CI publishing** — the release workflow authenticates to npm via trusted publishing (OIDC, no token) and runs `scripts/stage-publish.mjs`, which *stages* new versions; a maintainer approves them with 2FA on npmjs.com. The npm trusted publishers are stage-only. See `RELEASING.md`.

## Adding a new SQL dialect

1. Create `packages/plugin-<dialect>/` modelled on `packages/plugin-pgsql/`
2. Create `extensions/vsix-<dialect>/` modelled on `extensions/vsix-pgsql/`
3. Add `"@prettier-sql/core": "workspace:*"` to the plugin's `package.json` dependencies
4. Add a `<ProjectReference>` to `PrettierSql.Core.csproj` in the plugin's csproj
5. Add the new csproj to `prettier-sql.sln`
6. Reference the new plugin via `"workspace:*"` in the vsix's `bundled/package.json`

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

Both plugin `AstBuilder.cs` and `SqlParser.cs` files add `using PrettierSql.Core;`.

### Shared test fixtures

Standard SQL that both dialects must format identically:
`packages/core/tests/fixtures/shared/` — dml/ and select/ subdirectories.

Each plugin's `tests/fixtures.test.ts` runs these under a `shared fixtures` describe block
and also runs its own dialect-specific fixtures.

## Versioning (Changesets)

Each package versions independently. When changing user-facing behavior, add a changeset:

```bash
pnpm changeset          # interactive — select packages and bump type
pnpm changeset version  # bump versions and write changelogs (CI step)
pnpm changeset publish  # publish to npm (CI step)
```

`@prettier-sql/core` is private — it is never published to npm.

## C# project pattern

Each plugin's `src/dotnet/<Name>/<Name>.csproj` targets net8.0 and references
`PrettierSql.Core.csproj`. The build chain: `Core` compiles first; then each plugin
compiles against it. `dotnet publish` output lands in `bin/dotnet/` where node-api-dotnet
can load it.

## Pending tasks

- [ ] **Add `NPM_TOKEN` secret** — generate a Granular Access Token at npmjs.com (Account → Access Tokens, read+write for `prettier-plugin-tsql` and `prettier-plugin-postgresql`) and add it to GitHub repo settings (Settings → Secrets and variables → Actions → `NPM_TOKEN`).
- [ ] **Update npmjs.org** — update the package pages for `prettier-plugin-tsql` and `prettier-plugin-postgresql` to reflect the new monorepo home. Run `pnpm changeset` (patch bump on both plugins), merge the resulting "Version Packages" PR, and the release workflow will publish automatically.
- [ ] **Publish to npm** — after testing is complete, trigger a release by running `pnpm changeset`, committing the changeset file, and merging the "Version Packages" PR that the release workflow opens.

## Adding a new SQL dialect

1. Create `packages/plugin-<dialect>/` modelled on `packages/plugin-pgsql/`
2. Create `extensions/vsix-<dialect>/` modelled on `extensions/vsix-pgsql/`
3. Add `"@prettier-sql/core": "workspace:*"` to the plugin's `package.json` dependencies
4. Add a `<ProjectReference>` to `PrettierSql.Core.csproj` in the plugin's csproj
5. Add the new csproj to `prettier-sql.sln`
6. Reference the new plugin via `"workspace:*"` in the vsix's `bundled/package.json`

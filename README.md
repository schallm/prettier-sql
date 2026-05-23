# prettier-sql

Prettier plugins for SQL dialects, powered by native parsers — no regex, no guesswork.

| Package | Dialect | npm |
|---|---|---|
| [prettier-plugin-tsql](packages/plugin-tsql/) | T-SQL (SQL Server / Azure SQL) | [![npm](https://img.shields.io/npm/v/prettier-plugin-tsql)](https://www.npmjs.com/package/prettier-plugin-tsql) |
| [prettier-plugin-postgresql](packages/plugin-pgsql/) | PostgreSQL | [![npm](https://img.shields.io/npm/v/prettier-plugin-postgresql)](https://www.npmjs.com/package/prettier-plugin-postgresql) |

Each plugin ships its own docs:

- **T-SQL** — [Getting Started](packages/plugin-tsql/docs/getting-started.md) · [Options](packages/plugin-tsql/docs/options.md) · [Formatting Rules](packages/plugin-tsql/docs/formatting.md) · [Examples](packages/plugin-tsql/docs/examples.md)
- **PostgreSQL** — [Getting Started](packages/plugin-pgsql/docs/getting-started.md) · [Options](packages/plugin-pgsql/docs/options.md) · [Formatting Rules](packages/plugin-pgsql/docs/formatting.md) · [Examples](packages/plugin-pgsql/docs/examples.md)

## VS / SSMS Extensions

Editor extensions live under [extensions/](extensions/):

- [vsix-tsql](extensions/vsix-tsql/) — T-SQL formatter for Visual Studio and SSMS (Windows)
- [vsix-pgsql](extensions/vsix-pgsql/) — PostgreSQL formatter for Visual Studio and SSMS (Windows)

## Contributing

```bash
pnpm install      # install all workspace packages
pnpm -r build     # build all packages in dependency order
pnpm -r test      # run all test suites
```

See the [developer guide](CLAUDE.md) for architecture details.

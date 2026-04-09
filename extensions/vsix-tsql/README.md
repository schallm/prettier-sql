# Prettier T-SQL

Format T-SQL / SQL Server scripts using [Prettier](https://prettier.io/), powered by [prettier-plugin-tsql](https://github.com/schallm/prettier-plugin-tsql) and Microsoft's ScriptDom parser.

## Features

- Format the active SQL document with **Ctrl+K, Ctrl+J**
- Consistent, opinionated T-SQL formatting via Prettier

## Requirements

- [Node.js](https://nodejs.org/) must be installed and available on your system PATH
- .NET Framework 4.7.2 or later

## Supported Hosts

| Host                                                | Version                |
| --------------------------------------------------- | ---------------------- |
| Visual Studio Community / Professional / Enterprise | 2022 (v17), 2026 (v18) |
| SQL Server Management Studio                        | 22 (v22)               |

## Installation

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/), or download the `.vsix` file and install via **Extensions → Manage Extensions → Install from VSIX**.

## Formatting Options

### T-SQL Options

| Option           | Default    | Values                            |
| ---------------- | ---------- | --------------------------------- |
| `sqlKeywordCase` | `lower`    | `lower`, `upper`, `preserve`      |
| `sqlDensity`     | `standard` | `compact`, `standard`, `spacious` |
| `sqlCommaStyle`  | `trailing` | `trailing`, `leading`             |

**`sqlKeywordCase`** — Casing for SQL keywords (`SELECT`, `FROM`, `WHERE`, data types, built-in functions, etc.).

**`sqlDensity`** — Controls vertical spacing:

- `compact` — fits as much as possible on each line, wrapping at `printWidth`
- `standard` — one clause per line; single predicates stay inline
- `spacious` — every predicate on its own line, even single ones

**`sqlCommaStyle`** — Comma position in column lists (`SELECT`, `GROUP BY`, `ORDER BY`, CTE lists, `INSERT`, `UPDATE SET`). Function arguments always use trailing commas.

### Standard Prettier Options

| Option       | Extension Default | Prettier Default |
| ------------ | ----------------- | ---------------- |
| `printWidth` | `120`             | `80`             |
| `tabWidth`   | `4`               | `2`              |
| `useTabs`    | —                 | `false`          |

## License

MIT

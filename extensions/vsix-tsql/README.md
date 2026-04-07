# Prettier T-SQL

Format T-SQL / SQL Server scripts using [Prettier](https://prettier.io/), powered by [prettier-plugin-tsql](https://github.com/schallm/prettier-plugin-tsql) and Microsoft's ScriptDom parser.

## Features

- Format the active SQL document with **Ctrl+K, Ctrl+J**
- Consistent, opinionated T-SQL formatting via Prettier

## Requirements

- [Node.js](https://nodejs.org/) must be installed and available on your system PATH
- .NET Framework 4.7.2 or later

## Supported Hosts

| Host | Version |
|------|---------|
| Visual Studio Community / Professional / Enterprise | 2022 (v17), 2026 (v18) |
| SQL Server Management Studio | 22 (v22) |

## Installation

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/), or download the `.vsix` file and install via **Extensions → Manage Extensions → Install from VSIX**.

## Default Formatting Options

| Option | Default |
|--------|---------|
| `printWidth` | `120` |
| `tabWidth` | `4` |
| Parser | `tsql` |

## License

MIT

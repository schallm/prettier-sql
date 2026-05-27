# Prettier SQL

Format T-SQL (SQL Server) and PostgreSQL files in VS Code using [Prettier](https://prettier.io). No npm install, no config file required — just install the extension and format.

Powered by [prettier-plugin-tsql](https://www.npmjs.com/package/prettier-plugin-tsql) and [prettier-plugin-postgresql](https://www.npmjs.com/package/prettier-plugin-postgresql), using Microsoft's official **ScriptDom** parser for T-SQL and a high-fidelity PostgreSQL parser for PG.

## Requirements

**.NET 8 Runtime (or later)** must be installed. The extension will prompt you with a download link if it isn't found.

- [Download .NET 8 Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)

## Supported file types

| Extension | Language | Parser |
| --------- | -------- | ------ |
| `.tsql`   | T-SQL    | Microsoft ScriptDom |
| `.pgsql`  | PostgreSQL | PostgreSQL parser |
| `.sql`    | Either — see [Dialect selection](#dialect-selection) | |

## Usage

Use VS Code's standard **Format Document** command (`Shift+Alt+F` / `⇧⌥F`) or enable **Format on Save**:

```json
// .vscode/settings.json
{
    "editor.formatOnSave": true
}
```

To make Prettier SQL the default formatter for SQL files in a workspace:

```json
{
    "[sql]": {
        "editor.defaultFormatter": "PickyCode.prettier-sql"
    }
}
```

## Dialect selection

`.tsql` and `.pgsql` files are always formatted with the matching parser. For plain `.sql` files, the dialect is chosen in this order:

**1. File-level directive comment** — add as the first line of the file:

```sql
-- tsql
select top 10 * from dbo.Orders order by OrderDate desc;
```

```sql
-- pgsql
select id, name from users limit 10;
```

**2. Extension setting** — `prettierSql.defaultDialect` (default: `tsql`)

## Options

All options are available in **Settings** → search "Prettier SQL".

| Setting | Choices | Default |
| ------- | ------- | ------- |
| `prettierSql.defaultDialect` | `tsql` · `pgsql` | `tsql` |
| `prettierSql.sqlKeywordCase` | `lower` · `upper` · `preserve` | `lower` |
| `prettierSql.sqlDensity` | `compact` · `standard` · `spacious` | `standard` |
| `prettierSql.sqlCommaStyle` | `trailing` · `leading` | `trailing` |
| `prettierSql.printWidth` | integer | `120` |

### `sqlKeywordCase`

```sql
-- lower (default)
select id, title from books where in_stock = 1;

-- upper
SELECT id, title FROM books WHERE in_stock = 1;
```

### `sqlDensity`

```sql
-- standard (default): one clause per line, short predicates stay inline
select
  id,
  title,
  price
from books
where in_stock = 1
order by title;

-- compact: fits more on each line, wraps at printWidth
select id, title, price
from books
where in_stock = 1
order by title;

-- spacious: every predicate on its own indented line
select
  id,
  title,
  price
from books
where
  in_stock = 1
order by title;
```

### `sqlCommaStyle`

```sql
-- trailing (default)
select
  id,
  title,
  price
from books;

-- leading
select
  id
  , title
  , price
from books;
```

## Prettier config file support

If a `.prettierrc` or `prettier.config.js` exists in the workspace, its SQL options are picked up automatically. Extension settings act as defaults; the config file takes precedence.

```js
// prettier.config.js
export default {
    plugins: ['prettier-plugin-tsql'],
    sqlKeywordCase: 'upper',
    sqlDensity: 'standard',
    printWidth: 100,
};
```

## Formatter quality

Both parsers handle the full SQL dialect — no hand-rolled grammar. T-SQL uses Microsoft's own `TSql180Parser` (the same parser SQL Server uses), so statements are never silently mangled. If a statement can't be parsed, the original text is preserved unchanged.

See the full feature lists:
- [prettier-plugin-tsql features](https://github.com/schallm/prettier-sql/tree/main/packages/plugin-tsql#readme)
- [prettier-plugin-postgresql features](https://github.com/schallm/prettier-sql/tree/main/packages/plugin-pgsql#readme)

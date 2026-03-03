# Options Reference

All options are in the `SQL` category and can be set in any Prettier config file.

---

## `sqlKeywordCase`

Controls the casing of SQL keywords (`select`, `from`, `where`, `join`, data types, built-in functions, etc.).

| Value | Description | Default |
|---|---|---|
| `lower` | lowercase keywords | ✓ |
| `upper` | UPPERCASE keywords | |
| `preserve` | Keep original casing from input | |

### Examples

**`lower` (default)**
```sql
select
  b.book_id,
  b.title
from dbo.Books as b
where b.in_stock = 1;
```

**`upper`**
```sql
SELECT
  b.book_id,
  b.title
FROM dbo.Books AS b
WHERE b.in_stock = 1;
```

**`preserve`**
Input casing is kept as-is. Useful when your team has mixed conventions and you only want layout formatting.

---

## `sqlDensity`

Controls vertical spacing and how aggressively clauses and predicates are placed on their own lines.

| Value | Description | Default |
|---|---|---|
| `standard` | One clause per line; single predicates stay inline | ✓ |
| `compact` | Fits as much as possible per line, wraps at `printWidth` | |
| `spacious` | Every predicate on its own line, even single ones | |

### `standard` (default)

One clause keyword per line. Single WHERE/ON predicates stay on the same line as the keyword; multiple predicates each get their own line.

```sql
select
  b.book_id,
  b.title,
  b.price
from
  dbo.Books as b
  inner join dbo.Authors as a on b.author_id = a.author_id
where b.in_stock = 1
order by b.title asc;
```

With multiple WHERE predicates:

```sql
select book_id
from dbo.Books
where
  in_stock = 1
  and price < 50;
```

### `compact`

Tries to keep everything on as few lines as possible, wrapping only when a line would exceed `printWidth`.

```sql
select b.book_id, b.title, b.price
from dbo.Books as b inner join dbo.Authors as a on b.author_id = a.author_id
where b.in_stock = 1
order by b.title asc;
```

### `spacious`

Every predicate gets its own indented line, even when there is only one. Maximises vertical readability.

```sql
select
  b.book_id,
  b.title,
  b.price
from
  dbo.Books as b
  inner join dbo.Authors as a on
    b.author_id = a.author_id
where
  b.in_stock = 1
order by
  b.title asc;
```

---

## `sqlCommaStyle`

Controls where commas appear in column and value lists.

| Value | Description | Default |
|---|---|---|
| `trailing` | Comma at the end of the line | ✓ |
| `leading` | Comma at the start of the line | |

> **Note:** `leading` is declared but not yet implemented. Setting it currently has no effect — output will use trailing commas.

### `trailing` (default)

```sql
select
  book_id,
  title,
  price
from dbo.Books;
```

---

## Prettier's `printWidth`

The standard Prettier `printWidth` option (default `80`) controls when lines wrap. This plugin respects it for:

- Column lists in SELECT
- JOIN conditions that are too long to stay inline
- VALUES rows in INSERT
- ON predicates with multiple conditions

---

## Full Configuration Example

```js
// prettier.config.js
export default {
  plugins: ['prettier-plugin-tsql'],

  // SQL-specific options
  sqlKeywordCase: 'lower',    // lower | upper | preserve
  sqlDensity: 'standard',     // compact | standard | spacious
  sqlCommaStyle: 'trailing',  // trailing | leading

  // Standard Prettier options (also apply to SQL)
  printWidth: 100,
  tabWidth: 2,
};
```

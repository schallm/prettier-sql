# Options

All options are set per file glob using Prettier's `overrides` key.

---

## `sqlKeywordCase`

Controls the case of SQL keywords (`SELECT`, `FROM`, `WHERE`, `JOIN`, etc.).

| Value | Description |
|---|---|
| `lower` (default) | All keywords lowercase |
| `upper` | All keywords uppercase |
| `preserve` | Matches the file: keywords are printed in whichever case (upper or lower) the input mostly uses |

### `lower` (default)

```sql
select
  id,
  title
from books
where price < 50;
```

### `upper`

<!-- check-docs:skip -->
```sql
SELECT
  id,
  title
FROM books
WHERE price < 50;
```

### Example configuration

```js
// prettier.config.js
export default {
  plugins: ['prettier-plugin-postgresql'],
  overrides: [
    {
      files: '*.sql',
      options: {
        parser: 'pgsql',
        sqlKeywordCase: 'upper',
      },
    },
  ],
};
```

---

## `sqlDensity`

Controls whitespace density.

| Value | Description |
|---|---|
| `standard` (default) | One clause per line; a single FROM table and a single WHERE predicate stay inline; AND/OR conditions indent |
| `compact` | Fits as much as possible on each line, wrapping at `printWidth` |
| `spacious` | Every clause indents, even single predicates |

### `compact`

<!-- check-docs:skip -->
```sql
select id, title from books where price < 50 and in_stock order by price;
```

### `spacious`

<!-- check-docs:skip -->
```sql
select
  id,
  title
from
  books
where
  price < 50
  and in_stock
order by
  price;
```

---

## `sqlCommaStyle`

Controls where commas appear in column and value lists.

| Value | Description |
|---|---|
| `trailing` (default) | Comma at end of line |
| `leading` | Comma at start of next line |

### `trailing` (default)

```sql
select
  id,
  title,
  price
from books
where price < 50;
```

### `leading`

<!-- check-docs:skip -->
```sql
select
  id
  , title
  , price
from books
where price < 50;
```

---

## Prettier's `printWidth`

Prettier's standard `printWidth` option (default `80`) is respected. Column lists, JOIN conditions, and inline expressions wrap to new lines when the line would exceed the print width.

---

## Full Configuration Example

```js
// prettier.config.js
export default {
  plugins: ['prettier-plugin-postgresql'],
  overrides: [
    {
      files: ['*.sql', '*.pgsql'],
      options: {
        parser: 'pgsql',
        printWidth: 100,
        sqlKeywordCase: 'lower',
        sqlDensity: 'standard',
        sqlCommaStyle: 'trailing',
      },
    },
  ],
};
```

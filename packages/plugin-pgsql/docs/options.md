# Options

All options are set per file glob using Prettier's `overrides` key.

---

## `sqlKeywordCase`

Controls the case of SQL keywords (`SELECT`, `FROM`, `WHERE`, `JOIN`, etc.).

| Value | Description |
|---|---|
| `lower` (default) | All keywords lowercase |
| `upper` | All keywords uppercase |
| `preserve` | Keywords emitted as-is from the formatter's internal representation (currently uppercase) |

### `lower` (default)

```sql
select
  id,
  title
from
  books
where price < 50;
```

### `upper`

```sql
SELECT
  id,
  title
FROM
  books
WHERE price < 50;
```

### Example configuration

```js
// prettier.config.js
export default {
  plugins: ['prettier-plugin-pgsql'],
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

Controls whitespace density. Currently accepted but reserved for future use — the formatting output is identical across all three values while density-aware layout is being implemented.

| Value | Description |
|---|---|
| `compact` | Fewer line breaks; short clauses may stay inline |
| `standard` (default) | Balanced layout |
| `spacious` | Extra blank lines between major clauses |

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
from
  books
where price < 50;
```

### `leading`

```sql
select
  id
  , title
  , price
from
  books
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
  plugins: ['prettier-plugin-pgsql'],
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

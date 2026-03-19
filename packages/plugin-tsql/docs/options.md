# Options Reference

All options are in the `SQL` category and can be set in any Prettier config file.

---

## `sqlKeywordCase`

Controls the casing of SQL keywords (`select`, `from`, `where`, `join`, data types, built-in functions, etc.).

| Value      | Description                     | Default |
| ---------- | ------------------------------- | ------- |
| `lower`    | lowercase keywords              | ✓       |
| `upper`    | UPPERCASE keywords              |         |
| `preserve` | Keep original casing from input |         |

### Examples

**`lower` (default)**

```sql
select
    Books.Id,
    Books.Title
from Books
where Books.InStock = 1;
```

**`upper`**

```sql
select
    Books.Id,
    Books.Title
from Books
where Books.InStock = 1;
```

**`preserve`**
Input casing is kept as-is. Useful when your team has mixed conventions and you only want layout formatting.

---

## `sqlDensity`

Controls vertical spacing and how aggressively clauses and predicates are placed on their own lines.

| Value      | Description                                              | Default |
| ---------- | -------------------------------------------------------- | ------- |
| `standard` | One clause per line; single predicates stay inline       | ✓       |
| `compact`  | Fits as much as possible per line, wraps at `printWidth` |         |
| `spacious` | Every predicate on its own line, even single ones        |         |

### `standard` (default)

One clause keyword per line. Single WHERE/ON predicates stay on the same line as the keyword; multiple predicates each get their own line.

```sql
select
    Books.BookId,
    Books.Title,
    Books.Price
from
    Books
    inner join Authors on Books.AuthorId = Authors.Id
where Books.InStock = 1
order by Books.Title asc;
```

With multiple WHERE predicates:

```sql
select Id
from Books
where
    InStock = 1
    and Price < 50;
```

### `compact`

Tries to keep everything on as few lines as possible, wrapping only when a line would exceed `printWidth`.

```sql
select
    Books.BookId,
    Books.Title,
    Books.Price
from
    Books
    inner join Authors on Books.AuthorId = Authors.Id
where Books.InStock = 1
order by Books.Title asc;
```

### `spacious`

Every predicate gets its own indented line, even when there is only one. Maximises vertical readability.

```sql
select
    Books.BookId,
    Books.Title,
    Books.Price
from
    Books
    inner join Authors on Books.AuthorId = Authors.Id
where Books.InStock = 1
order by Books.Title asc;
```

---

## `sqlCommaStyle`

Controls where commas appear in column and value lists.

| Value      | Description                    | Default |
| ---------- | ------------------------------ | ------- |
| `trailing` | Comma at the end of the line   | ✓       |
| `leading`  | Comma at the start of the line |         |

Leading commas apply to SELECT column lists, GROUP BY, ORDER BY, CTE lists, INSERT column lists, INSERT VALUES rows, and UPDATE SET assignments. Function arguments and DDL definitions (CREATE TABLE columns, procedure parameters) always use trailing commas.

### `trailing` (default)

```sql
select
    Id,
    Title,
    Price
from Books;

insert into Books (Title, Price)
values
    ('A', 1.00),
    ('B', 2.00);

update Books
set
    Title = @title,
    Price = @price
where BookId = @id;
```

### `leading`

```sql
select
    Id,
    Title,
    Price
from Books;

insert into Books (Title, Price)
values
    ('A', 1.00),
    ('B', 2.00);

update Books
set
    Title = @title,
    Price = @price
where BookId = @id;
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
    sqlKeywordCase: 'lower', // lower | upper | preserve
    sqlDensity: 'standard', // compact | standard | spacious
    sqlCommaStyle: 'trailing', // trailing | leading

    // Standard Prettier options (also apply to SQL)
    printWidth: 100,
    tabWidth: 2,
};
```

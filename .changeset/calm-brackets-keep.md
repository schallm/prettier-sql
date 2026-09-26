---
"prettier-plugin-tsql": patch
"prettier-plugin-postgresql": patch
---

T-SQL: formatting no longer changes what SQL does.

- Bracketed reserved words keep their brackets (`[order]`, `ON [primary]`), and
  bracketed index, constraint, cursor, window and other names are preserved.
- CLR and xml methods (`h.GetAncestor()`, `x.value()`) and user functions keep
  their casing; only built-in functions follow `sqlKeywordCase`.
- `$action` and other pseudo-columns, `GROUP BY ALL`, `WITH ROLLUP`,
  `INSERT TOP (n)`, and `EXEC … WITH RECOMPILE` are kept.
- `SET NOCOUNT, XACT_ABORT ON` no longer prints `XACTABORT`.
- `ALTER TABLE … DROP CONSTRAINT x, COLUMN y` keeps each keyword, so `y` is no
  longer dropped as a constraint.
- `OUTPUT` is placed before `FROM` in `UPDATE` and multi-table `DELETE`;
  `SET @v = col = expr` and `SET col.WRITE(…)` print valid SQL.
- `@variables` in hints (`OPTIMIZE FOR (@p = 1)`) keep their case.
- Compact density no longer deletes comments between WHERE predicates.

Both plugins can now be loaded in the same process (for example a Prettier config
listing both); previously whichever parsed second failed.

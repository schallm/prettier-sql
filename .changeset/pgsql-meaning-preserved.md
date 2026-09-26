---
"prettier-plugin-postgresql": patch
---

Fix formatting that changed what SQL means or produced SQL that doesn't parse:

- `UNION` / `INTERSECT` / `EXCEPT` kept their `WITH`, `ORDER BY`, `LIMIT` and locking clauses, and operands are parenthesized where needed.
- `ARRAY(subquery)`, `(f(x)).*`, `ROW(...)` and row comparisons with a subquery are preserved.
- Type names resolve as written (`float8`, `"char"`, `int[3]`, `pg_catalog.text`), and casts to `interval` of non-literals stay casts.
- Constraints keep every clause: `EXCLUDE`, `MATCH FULL`, `NO INHERIT`, `NOT VALID`, `INCLUDE` / `WITH` / `USING INDEX TABLESPACE`, `ON DELETE SET NULL (cols)`, identity options, table-level `DEFERRABLE`, and `USING INDEX`.
- `ON CONFLICT` keeps expression targets and the partial-index `WHERE`.
- `ALTER ... RENAME` works for every object kind, including `ALTER TYPE ... RENAME VALUE`, which had become `ADD VALUE`.
- `DROP TRIGGER / POLICY / RULE ... ON`, `DROP OPERATOR CLASS ... USING`, `DROP CAST` and `DROP TRANSFORM` are printed correctly.
- Kept: `COMMIT AND CHAIN`, `ALTER COLUMN ... TYPE ... USING`, `ALTER TYPE ... ADD / DROP / ALTER ATTRIBUTE`, VACUUM / ANALYZE option values, `current_timestamp(0)`-style precision, schema-qualified `OPERATOR(...)`, SQL/JSON `PASSING`, wrapper, quotes and `ON EMPTY` / `ON ERROR` clauses, and JSON aggregate `ORDER BY` / `FILTER` / `OVER`.
- Quotes in enum values are escaped, and `DO` blocks no longer gain a `LANGUAGE plpgsql`.

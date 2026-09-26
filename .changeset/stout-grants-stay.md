---
"prettier-plugin-postgresql": patch
---

PostgreSQL: DDL formatting no longer drops clauses that change what a statement does.

- `CREATE TEMP` / `UNLOGGED TABLE`, `ON COMMIT`, `IF NOT EXISTS`, `INHERITS`,
  `USING`, `WITH (…)` and `TABLESPACE` are kept; `CREATE TABLE … AS` and
  materialized views also keep their column lists and `WITH NO DATA`.
- `GRANT` / `REVOKE` keep column lists (`INSERT (a)`), `GRANT OPTION FOR` and
  `GRANTED BY`; `CURRENT_USER` and similar grantees no longer print as nothing.
- `CREATE FUNCTION` keeps `OR REPLACE`, `SETOF`, parameter defaults and every
  attribute (`SECURITY DEFINER`, `STRICT`, volatility, `PARALLEL`, `COST`, `SET`,
  …); `CREATE PROCEDURE` no longer prints as `CREATE FUNCTION`; C functions keep
  their link symbol; bodies containing `$$` get a safe dollar-quote tag.
- `ALTER FUNCTION … SECURITY DEFINER` no longer prints as `SECURITY INVOKER`.
- `CREATE TRIGGER` keeps `UPDATE OF` columns, function arguments, `OR REPLACE`,
  constraint-trigger options and `REFERENCING` transition tables.
- Functions and `VALUES` lists in `FROM` format again, and alias column lists
  (`AS g(n)`, `WITH c(a, b)`) are kept.
- `DROP`, `ALTER`, `COMMENT ON` and `GRANT` keep function and operator argument
  types.

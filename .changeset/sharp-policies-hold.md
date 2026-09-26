---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

PostgreSQL: more fixes for formatting that changed what SQL does.

- `CREATE POLICY … AS RESTRICTIVE` and the `TO role, …` list of `CREATE POLICY` /
  `ALTER POLICY` were dropped, turning restrictive policies permissive and
  role-scoped policies into policies for everyone.
- `ALTER TABLE IF EXISTS`, `DROP CONSTRAINT IF EXISTS`, and `CASCADE` on dropped
  columns and constraints were dropped; `ADD COLUMN IF NOT EXISTS` printed as the
  invalid `ADD COLUMN IF EXISTS`.
- `ONLY` was dropped from `SELECT`, `UPDATE`, `DELETE`, `ALTER TABLE`, `TRUNCATE`
  and `LOCK`, so statements recursed into inheritance children and partitions.
- `ALTER VIEW` / `ALTER INDEX` / `ALTER MATERIALIZED VIEW` printed as `ALTER TABLE`,
  and `ALTER TABLE s.t SET SCHEMA x` lost the table name.
- Unsupported `ALTER TABLE` subcommands (e.g. `OWNER TO`) now fail with a clear
  error instead of printing invalid SQL such as `changeowner`.
- `SET` values: numbers were dropped (`set statement_timeout = ;`) and quoted
  mixed-case values were lowercased (`search_path` `"MySchema"` → `myschema`).
- Role passwords were recased by `sqlKeywordCase` and weren't escaped.

Both plugins: `sqlKeywordCase` never recases the inside of single-quoted literals.

---
"prettier-plugin-postgresql": minor
---

PostgreSQL: more clauses that were silently dropped are now kept.

- Queries: `ORDER BY … NULLS FIRST/LAST` and `USING <`, `GROUP BY DISTINCT`,
  `LIKE` / `SIMILAR TO … ESCAPE`, `WITHIN GROUP (ORDER BY …)`, window
  `EXCLUDE …` and base windows (`w2 AS (w …)`), `NATURAL LEFT/FULL JOIN`
  (printed as an inner join), `JOIN … USING (…) AS j`, aliases on
  parenthesized joins, and the parentheses around nested joins.
- Views: `OR REPLACE`, `TEMPORARY`, column lists, `WITH (…)` and
  `WITH CHECK OPTION`.
- Indexes: `NULLS FIRST/LAST`, operator classes, `COLLATE`, `NULLS NOT DISTINCT`,
  `WITH (…)`, `TABLESPACE`, `ON ONLY`, and parentheses around expression columns.
- Column `COLLATE`; sequence `AS`, `OWNED BY`, `TEMPORARY` and 64-bit bounds;
  `DROP INDEX CONCURRENTLY`; CTE `[NOT] MATERIALIZED`.
- `EXPLAIN (analyze, …)` no longer crashes, and `COPY … csv header` no longer
  prints `header ''`.

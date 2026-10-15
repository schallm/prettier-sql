---
"prettier-plugin-tsql": patch
---

Fixes found by formatting Microsoft's ScriptDom test scripts:

- `OPTION (BYPASS OPTIMIZER_QUEUE)` and `OPTION (OPTIMIZE CORRELATED UNION ALL)` no longer fail to format.
- `OUTPUT … INTO @t` followed by a plain `OUTPUT …` keeps both clauses on `INSERT`, `UPDATE`, `DELETE` and `MERGE`; the plain `OUTPUT` was dropped.
- A `NULL` principal in `GRANT`, `DENY` and `REVOKE` (`TO public, null, u`) is kept; it printed as nothing, leaving `public, , u`.
- Qualified names keep every part: `ENABLE / DISABLE TRIGGER db.schema.trg`, a type's schema in `dbo.MyType::Method()`, and a `PIVOT`'s aggregate (`dbo.MyAggregate`) and column qualifiers (`t.Amount`); all but the last part were dropped.
- `WITH CHANGE_TRACKING_CONTEXT (…)` followed by CTEs prints as one `WITH` (it printed as two, which doesn't parse), and `MERGE` keeps its change-tracking context. `INSERT`, `UPDATE`, `DELETE` and `MERGE` keep a `WITH XMLNAMESPACES (…)`; both were dropped.
- `CREATE MATERIALIZED VIEW … WITH (DISTRIBUTION = HASH(…) | ROUND_ROBIN, FOR_APPEND)` and `ALTER MATERIALIZED VIEW … REBUILD | DISABLE` are formatted; they printed as a plain `CREATE VIEW` with broken options, or an empty `ALTER VIEW … AS`.
- Multi-word type spellings keep their type: `char varying(10)` became `char(10)`, `national char varying` and `nchar varying` lost `varying` or `national`. They now print as `varchar`, `nvarchar`, `nchar`, `varbinary` and `ntext`.
- Qualified pseudo-columns keep the pseudo-column: `t.identitycol`, `a.b.rowguidcol`, `t.$identity` and `t.$rowguid` printed as just `t` (or `a.b`). A full-text predicate's `t.*` keeps its table; it printed as `*`.
- `UNPIVOT (… IN (t.c0, c1))` keeps each column's qualifier.
- `IDENTITY(+100000, -2)` keeps a signed seed and increment; they were dropped, leaving `IDENTITY` (1, 1).
- A computed column keeps its constraints (`c AS a + b UNIQUE`, `PERSISTED PRIMARY KEY`, `CHECK`, `REFERENCES`); only `NULL` / `NOT NULL` was kept.

---
name: Follow tsql formatting patterns
description: When implementing new printers in prettier-plugin-pgsql, follow the approach from prettier-plugin-tsql
type: feedback
---

Always follow the formatting patterns from /Users/mike/Projects/schall/prettier-plugin-tsql when implementing printers in pgsql.

**Why:** User explicitly asked us to align with tsql. The two plugins are intentionally sister projects with the same architecture.

**How to apply:**
- Wrap statements with `group()` so Prettier can make layout decisions
- Export `printQueryExpr` for any node that can appear as a sub-expression — it renders SELECT/SetOp without a trailing `;`
- Use density-aware WHERE/HAVING via `printBoolClause`: single predicate inline in compact/standard, indented in spacious; multi-predicate always indented
- Always indent FROM items (even single table) so JOINs align properly under FROM
- Use `softSep` within VALUES row columns and column lists in parens; use `hardSep` between rows and SET clauses
- Density-aware SET: single assignment stays inline in non-spacious mode
- Check /Users/mike/Projects/schall/prettier-plugin-tsql/src/plugin/printer/statements.ts and expressions.ts for patterns before implementing new features

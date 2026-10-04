---
"prettier-plugin-tsql": patch
---

Format graph `SHORTEST_PATH` queries. `WITHIN GROUP (GRAPH PATH)` made the formatter crash, and `FOR PATH` was dropped from the tables the path walks (`Person FOR PATH AS p2`).

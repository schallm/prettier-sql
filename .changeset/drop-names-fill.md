---
"prettier-plugin-tsql": minor
---

Lay out `DROP` as the PostgreSQL plugin does: on one line when it fits, otherwise the names fill an indented line. `DROP INDEX a, b` no longer puts each index on a line of its own, and a long `DROP TABLE a, b, c` now wraps.

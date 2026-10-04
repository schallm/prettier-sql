---
"prettier-plugin-postgresql": patch
---

Wrap a long `DROP` or `TRUNCATE`: the names fill an indented line, and `ON`, `USING`, `RESTART IDENTITY` and `CASCADE` each go on a line of their own, when the statement doesn't fit within `printWidth`. One that fits stays on one line.

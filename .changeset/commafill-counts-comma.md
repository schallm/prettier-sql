---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

Count the comma after the last item on a line when packing a list several items to a line. A packed line (a long `IN` list, the names of a `DROP` or `TRUNCATE`, compact density) could end one column past `printWidth` because the comma wasn't counted.

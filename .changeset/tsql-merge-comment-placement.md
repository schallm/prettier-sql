---
"prettier-plugin-tsql": patch
---

`MERGE ... USING source -- comment` keeps the comment right after the source table instead of it drifting past `ON` onto the wrong line.

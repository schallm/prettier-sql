---
"prettier-plugin-tsql": patch
---

Keep the columns of a window's `PARTITION BY` on one line when they fit. They were split onto separate lines (`PARTITION BY a.x,` / `a.y`) whenever the window had more than one clause. A list that doesn't fit continues on indented lines.

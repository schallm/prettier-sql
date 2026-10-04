---
"prettier-plugin-postgresql": patch
---

Break a window specification that doesn't fit within `printWidth` — `OVER (...)` and the `WINDOW` clause — with `PARTITION BY`, `ORDER BY` and the frame each on their own line. One that fits stays on one line.

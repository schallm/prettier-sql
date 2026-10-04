---
"prettier-plugin-postgresql": patch
---

Wrap the first line of a long `GRANT` / `REVOKE`: when `GRANT privileges ON object` doesn't fit within `printWidth`, the privileges go on an indented line of their own, filling it, and `ON ...` starts the next line.

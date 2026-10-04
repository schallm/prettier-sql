---
"prettier-plugin-postgresql": patch
---

Put the value of a `SET name = ...` on an indented line of its own, filling it, when the value list (such as `search_path`) or string doesn't fit after the `=` within `printWidth`.

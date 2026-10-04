---
"prettier-plugin-postgresql": patch
---

Move the text of a `COMMENT ON ... IS '...'` to an indented line of its own when it doesn't fit after `IS` within `printWidth`.

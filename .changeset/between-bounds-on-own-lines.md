---
"prettier-plugin-postgresql": patch
"prettier-plugin-tsql": patch
---

When even `x BETWEEN low` doesn't fit within `printWidth`, put the two bounds of a `BETWEEN` on indented lines of their own, the second starting with `AND`. A predicate where only the `AND` bound doesn't fit still breaks before it.

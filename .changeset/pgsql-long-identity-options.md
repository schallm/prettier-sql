---
"prettier-plugin-postgresql": patch
---

Put the options of `GENERATED ... AS IDENTITY (...)` (`START WITH`, `INCREMENT BY`, `MINVALUE`, ...) one per line between the parentheses when they don't fit within `printWidth`. They are separated by spaces, so no commas are added.

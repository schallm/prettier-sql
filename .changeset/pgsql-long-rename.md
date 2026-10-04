---
"prettier-plugin-postgresql": patch
---

Wrap a long `ALTER ... RENAME ... TO ...`: the `RENAME` clause goes on an indented line below the object, and its `TO` on one more when even that doesn't fit within `printWidth`. A rename that fits stays on one line.

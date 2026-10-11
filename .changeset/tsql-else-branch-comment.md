---
"prettier-plugin-tsql": patch
---

Keep a comment inside a statement of an `ELSE` branch (`else select /* c */ 2`) in that branch; it moved to the statement before `ELSE`.

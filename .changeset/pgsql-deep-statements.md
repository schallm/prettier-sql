---
"prettier-plugin-postgresql": patch
---

Format statements with a chain of more than about 30 operators (`a || b || ...`), which failed with "A possible object cycle was detected", and give a clear error for the chains of about 50 or more that the parser itself can't read.

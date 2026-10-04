---
"prettier-plugin-postgresql": patch
---

Wrap a `FOREIGN KEY` or `CHECK` constraint that doesn't fit within `printWidth`: the constraint name stays on the first line and `FOREIGN KEY (...)`, `REFERENCES ...`, `ON UPDATE`, `ON DELETE`, the `DEFERRABLE` / `NOT VALID` / `NO INHERIT` attributes and `CHECK (...)` each go on an indented line of their own. A constraint that fits stays on one line.

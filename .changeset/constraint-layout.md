---
"prettier-plugin-tsql": minor
---

Lay out constraints as the PostgreSQL plugin does. `NULL` / `NOT NULL` and `DEFAULT` keep the order they were written in. A `FOREIGN KEY` or `CHECK` stays on one line when it fits, otherwise the constraint name goes on its own line with each clause (`FOREIGN KEY (…)`, `REFERENCES …`, `ON UPDATE …`, `ON DELETE …`) on an indented line below it, and a long `CHECK` condition breaks inside its parentheses. A `PRIMARY KEY` / `UNIQUE` stays on the constraint name's line.

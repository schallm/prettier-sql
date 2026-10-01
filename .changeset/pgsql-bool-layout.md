---
"prettier-plugin-postgresql": patch
---

Lay out `AND`/`OR` outside WHERE/HAVING-style clauses on one line when it fits (select lists, `JOIN ... ON`, `CASE`, function arguments, CHECK, policies, triggers), hanging indented otherwise, instead of starting each operand at column 0. Parenthesised `AND`/`OR` groups stay on one line when short.

---
"prettier-plugin-postgresql": patch
---

Keep the quotes on a function named like a keyword (`"position"(a, b)`, `"char"(a)`), and on a collation or text search object named `"left"` and the like; bare, these are different syntax or a syntax error.

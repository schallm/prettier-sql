---
"prettier-plugin-tsql": patch
---

Keep comments next to what they annotate: a comment right after a CTE's opening parenthesis now leads that CTE's query, a comment after a CTE's closing parenthesis stays by it (it used to end up after the whole statement), and a comment in the middle of a column definition stays with that column.

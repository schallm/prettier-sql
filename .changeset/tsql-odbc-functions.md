---
"prettier-plugin-tsql": patch
---

ODBC function escapes such as `{fn UCASE('a')}` keep their `{fn ...}` wrapper; without it the functions don't exist.

---
"prettier-plugin-tsql": patch
---

An `IF` whose condition spans several lines (a long `EXISTS (...)`, say) now puts its single statement on its own line instead of after the closing parenthesis.

---
"prettier-plugin-tsql": patch
---

With `sqlCommaStyle: "leading"`, fill-packed lists (UPDATE SET, INSERT column lists) no longer print a stray space before the comma (`a = 1 , b = 2`).

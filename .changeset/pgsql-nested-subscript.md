---
"prettier-plugin-postgresql": patch
---

Keep the parentheses of a subscripted expression that is subscripted again: `(a[1])[2]` no longer prints as `a[1][2]`, which takes a different element.

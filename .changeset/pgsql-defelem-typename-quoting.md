---
"prettier-plugin-postgresql": patch
---

A bare reloption/option identifier value (e.g. `WITH (x = "Off")`) is now re-quoted like any other identifier instead of printing bare, which was folding it to lowercase (`off`) on the next parse and changing its value.

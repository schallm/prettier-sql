---
"prettier-plugin-postgresql": patch
---

`INSERT INTO`, `UPDATE`, and `DELETE FROM` keep the target table's `AS alias` — it was silently dropped, breaking any qualified reference to it elsewhere in the statement (e.g. `ON CONFLICT ... DO UPDATE ... WHERE x.a > 0`).

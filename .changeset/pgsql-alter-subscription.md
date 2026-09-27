---
"prettier-plugin-postgresql": patch
---

`ALTER SUBSCRIPTION` no longer deletes the statement (it printed `/* unknown: AlterSubscriptionStatement */`); every form (`CONNECTION`, `SET`/`ADD`/`DROP PUBLICATION`, `REFRESH PUBLICATION`, `ENABLE`/`DISABLE`, `SET (...)`, `SKIP (...)`) now round-trips. `ALTER PUBLICATION`'s object-list and reloption forms, and `DROP SUBSCRIPTION ... CASCADE`, are also now printed correctly instead of being dropped or silently losing `CASCADE`.

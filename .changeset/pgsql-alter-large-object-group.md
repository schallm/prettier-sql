---
"prettier-plugin-postgresql": patch
---

Keep the OID of `ALTER LARGE OBJECT`, the `ADD USER` / `DROP USER` member list of `ALTER GROUP`, and `OWNER TO current_user` (and the other role keywords), instead of printing a statement that means something else.

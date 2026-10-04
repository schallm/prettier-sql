---
"prettier-plugin-postgresql": patch
---

Format `CREATE EVENT TRIGGER`: the name, `ON event`, the `WHEN tag IN (...)` filters and `EXECUTE FUNCTION f()` each on their own line, like `CREATE TRIGGER`. It used to be kept exactly as written. `EXECUTE PROCEDURE` is printed as `EXECUTE FUNCTION`, which PostgreSQL parses to the same statement.

-- Scratch file for manual PostgreSQL formatting tests.
-- Format with: prettier --write examples/test.sql
-- (from packages/plugin-pgsql/)

SELECT id,title,price FROM books WHERE in_stock=true ORDER BY price DESC

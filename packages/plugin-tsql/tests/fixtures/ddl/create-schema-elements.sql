-- CREATE SCHEMA with schema elements: one statement, no semicolons between elements
CREATE SCHEMA s AUTHORIZATION dbo CREATE TABLE t (a int) GRANT SELECT ON t TO u;
GO
CREATE SCHEMA s CREATE VIEW v AS SELECT 1 AS a CREATE TABLE t2 (b int) DENY SELECT ON v TO u;
GO
CREATE SCHEMA s;

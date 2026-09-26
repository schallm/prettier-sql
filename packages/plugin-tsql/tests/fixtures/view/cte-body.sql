-- A view body can start with WITH (CTEs, XMLNAMESPACES); view column names keep their brackets
CREATE OR ALTER VIEW v AS WITH c AS (SELECT 1 AS a) SELECT a FROM c;
GO
CREATE VIEW dbo.v ([my col], b) WITH SCHEMABINDING AS WITH x AS (SELECT a FROM dbo.t), y AS (SELECT a FROM x) SELECT a, a FROM y;
GO
ALTER VIEW v AS WITH XMLNAMESPACES ('urn:x' AS x) SELECT 1 AS a;

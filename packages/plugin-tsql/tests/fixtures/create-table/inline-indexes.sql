-- Indexes declared inside a table body: column-level, table-level, in table variables and table types
CREATE TABLE t (a int PRIMARY KEY, b int DEFAULT 0 INDEX ix, c int INDEX ix2 NONCLUSTERED, INDEX ix3 (c) WHERE c > 0);
DECLARE @t TABLE (a int PRIMARY KEY, b int DEFAULT 0 INDEX ix, INDEX ix3 NONCLUSTERED (b, a DESC));
CREATE TYPE dbo.TT AS TABLE (a int PRIMARY KEY NONCLUSTERED, b int INDEX ib, INDEX ix (a)) WITH (MEMORY_OPTIMIZED = ON);

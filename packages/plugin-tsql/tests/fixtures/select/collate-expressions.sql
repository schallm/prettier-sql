-- COLLATE after any primary expression, not just a column
SELECT COLLATIONPROPERTY('x', 'y') COLLATE Latin1_General_BIN FROM t;
SELECT a COLLATE DATABASE_DEFAULT, 'x' COLLATE Latin1_General_BIN, @v COLLATE Latin1_General_BIN, (a + b) COLLATE Latin1_General_BIN, upper(a) COLLATE Latin1_General_BIN, CAST(a AS varchar(10)) COLLATE Latin1_General_BIN FROM t;
SELECT a FROM t WHERE a COLLATE Latin1_General_CS_AS = 'X' ORDER BY a COLLATE Latin1_General_BIN;
SELECT CASE WHEN a = 1 THEN 'x' END COLLATE Latin1_General_BIN, (SELECT max(a) FROM t) COLLATE Latin1_General_BIN, IIF(a = 1, 'x', 'y') COLLATE Latin1_General_BIN, coalesce(a, b) COLLATE Latin1_General_BIN, t.c.value('.', 'varchar(10)') COLLATE Latin1_General_BIN FROM t;

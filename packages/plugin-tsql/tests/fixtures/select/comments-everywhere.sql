-- Comments in every position must survive formatting (none may be dropped or merged)
SELECT a, -- first
  b -- second
FROM t;

SELECT a /* x */, b FROM t /* after t */ WHERE a = 1 /* after pred */;

SELECT a
FROM t -- table
JOIN u ON u.id = t.id -- join cond
WHERE a = 1 -- pred one
  AND b = 2 -- pred two
GROUP BY a -- group
ORDER BY a; -- order

UPDATE t SET a = 1, -- first set
  b = 2 -- second set
WHERE id = 3;

INSERT INTO t (a, -- col a
  b) VALUES (1, 2);

SELECT CASE WHEN a = 1 THEN 'x' -- when one
  ELSE 'y' END FROM t;

SELECT f(a, -- arg
  b) FROM t;

EXEC p @a = 1, -- first param
  @b = 2;

CREATE TABLE t (a int, -- col a
  b int -- col b
);

SELECT a FROM t WHERE a IN (1, -- one
  2);

DECLARE @a int = 1; -- trailing
SET @a = 2; /* block */

IF @a = 1 -- cond
  PRINT 'x';

SELECT * FROM (SELECT a -- inner
  FROM t) AS s;

WITH c AS (SELECT a FROM t -- cte
) SELECT * FROM c;

SELECT a FROM t
UNION ALL -- union
SELECT b FROM u;
CREATE TABLE t (a int, -- col a
  b int, -- col b
  CONSTRAINT pk PRIMARY KEY (a) -- pk
);

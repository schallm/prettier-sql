-- INTERVAL literals
SELECT INTERVAL '1 day', INTERVAL '2 hours 30 minutes' FROM t;

-- :: cast style (type cast)
SELECT price::numeric, name::text, '2024-01-01'::date FROM t;

-- Array subscript (single index and slice)
SELECT arr[1], arr[2:4], arr[:3], arr[1:] FROM t;

-- Named function arguments
SELECT make_date(year => 2024, month => 1, day => 15);

-- ROLLUP / CUBE / GROUPING SETS
SELECT dept, SUM(salary) FROM emp GROUP BY ROLLUP(dept);
SELECT dept, job, SUM(salary) FROM emp GROUP BY CUBE(dept, job);
SELECT dept, job, SUM(salary) FROM emp GROUP BY GROUPING SETS ((dept, job), (dept), ());

-- Bare option flags, quoted values, * and column lists in EXPLAIN and COPY options
explain (analyze, buffers, format json) select 1;
explain (analyze false, costs off, settings) select 1;
explain analyze verbose select 1;
explain analyze select 1;
copy (select 1) to '/tmp/x' with csv header;
copy t (a, b) from stdin with (format csv, header true, delimiter ';', null '', encoding 'UTF8', force_not_null (a, "B"));
copy t to stdout with (format csv, force_quote *);
copy t from '/tmp/x' (format text, header match);

-- VACUUM / ANALYZE column lists
vacuum (analyze, verbose) t (a), u;
analyze t (a, "B");
vacuum full t;

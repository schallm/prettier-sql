-- SET
set search_path = public, myschema;

set work_mem = '64MB';

set local client_encoding = 'UTF8';

-- SET TO DEFAULT
set work_mem to default;

-- RESET
reset search_path;

reset all;

-- SHOW
show work_mem;

show all;

-- Case-sensitive and numeric values must survive
set search_path to "MySchema", public;
set statement_timeout = 5000;
set enable_seqscan = off;

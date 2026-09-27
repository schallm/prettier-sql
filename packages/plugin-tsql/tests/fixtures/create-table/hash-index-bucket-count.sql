-- BUCKET_COUNT on a memory-optimized table's hash index: the option name was
-- being dropped, leaving only the value (e.g. "with (1024)"), which doesn't parse.
create table t (a int not null, index ix hash (a) with (bucket_count = 1024))

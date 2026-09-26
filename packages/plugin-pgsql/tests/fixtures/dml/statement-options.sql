-- Options that are easy to drop: AND CHAIN, VACUUM values, DO, enum values, USING, precision

do $$ begin raise notice 'x'; end $$;

do language plperl $$ 1 $$;

commit and chain;

rollback and chain;

analyze verbose t (a);

vacuum (parallel 4, index_cleanup off, verbose) t;

vacuum full t;

select localtimestamp(3), current_timestamp(0), current_time(2), localtime, current_date;

alter table t alter column a type bigint using a::bigint;

alter type mood rename value 'sad' to 'blue';

alter type mood add value if not exists 'it''s' before 'x';

create type q as enum ('a''b', 'c');

alter type addr add attribute zip text, drop attribute if exists old cascade, alter attribute a type int;

create function f() returns table (a int, b text) as $$ select 1, 'x' $$ language sql;

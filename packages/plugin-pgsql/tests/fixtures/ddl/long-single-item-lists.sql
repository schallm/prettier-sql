create table t (id integer) partition by range (very_long_column_name_one, very_long_column_name_two, very_long_column_name_three);
create table t (id integer) partition by list (lower(some_very_long_column_name_used_as_the_partition_key_value));
create table t1 partition of t for values from (1000000, 'some long literal') to (2000000, 'another long literal');
create table t2 partition of t for values in ('one_long_value', 'two_long_value', 'three_long_value', 'four_long_value', 'five');
create table t3 partition of t for values with (modulus 4, remainder 1);
create index concurrently ix_very_long_index_name on some_long_table_name using gin (very_long_column_name_one jsonb_path_ops);
create index ix_short on t (a);
select distinct on (a.very_long_column_name_one, a.very_long_column_name_two, a.very_long_column_name_three) a.id from t a;
select distinct on (a.x) a.id from t a;

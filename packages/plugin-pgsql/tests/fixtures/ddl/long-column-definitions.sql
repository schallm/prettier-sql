create table t (very_long_column_name_one integer not null constraint pk_very_long_name primary key, b varchar(10) default 'abc', c int not null);
alter table t add column very_long_column_name_two integer not null default 100000000 references other_table (id) on delete cascade;

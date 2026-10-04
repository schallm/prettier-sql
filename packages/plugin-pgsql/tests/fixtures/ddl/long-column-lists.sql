create index ix_very_long_index_name on some_table (very_long_column_name_one, very_long_column_name_two) include (c3, c4, c5);
create index ix_short on t (a, b);
create view v (very_long_column_name_one, very_long_column_name_two, very_long_column_name_three) as select 1, 2, 3;
alter table t add constraint fk_very_long_constraint_name foreign key (very_long_column_name_one, very_long_column_name_two) references other_table (id, id2);
alter table t add constraint pk_very_long_constraint_name primary key (very_long_column_name_one, very_long_column_name_two, very_long_three);
create table t2 (very_long_column_name_one, very_long_column_name_two, very_long_column_name_three) as select 1, 2, 3;
create unique index concurrently if not exists i on only t (a desc nulls last, lower(b) text_pattern_ops, c collate "C" nulls first) include (d) nulls not distinct with (fillfactor = 80) tablespace fast where e is not null;

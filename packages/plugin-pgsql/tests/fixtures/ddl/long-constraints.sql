create table t (id integer, constraint fk_very_long_constraint_name foreign key (very_long_column_name_one) references other_table (id) on delete cascade on update restrict deferrable initially deferred);
create table t (a integer, constraint ck_very_long_constraint_name check (a > 0 and very_long_column_name_two > 0 and very_long_column_name_three < 100));
create table t (a integer, b integer, foreign key (a, b) references other_table (x, y) match full on delete set null (a) not valid);
create table t (a integer, check (a > 0) no inherit, constraint short_fk foreign key (a) references o (id));
create table t (a integer references other_table_with_a_long_name (very_long_column_name_one) on delete cascade on update cascade deferrable);
alter table t add constraint fk_very_long_constraint_name foreign key (very_long_column_name_one, very_long_column_name_two) references other_table (id, id2);
alter table t add constraint ck_very_long_constraint_name check (very_long_column_name_one > 0 and very_long_column_name_two > 0) not valid;

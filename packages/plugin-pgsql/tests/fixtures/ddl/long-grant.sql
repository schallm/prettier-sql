grant select, insert, update, delete, truncate, references, trigger on some_long_table_name to some_long_role_name, another_role_name with grant option;
grant select on t to u;
grant select (very_long_column_name_one, very_long_column_name_two), update (very_long_column_name_three) on some_long_table_name to u;
grant all privileges on all tables in schema some_long_schema_name to some_long_role_name;
revoke grant option for select, insert, update, delete, truncate, references, trigger on some_long_table_name from some_long_role_name cascade;

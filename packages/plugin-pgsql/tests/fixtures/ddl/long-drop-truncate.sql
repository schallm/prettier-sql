drop table if exists some_long_table_name_one, some_long_table_name_two, some_long_table_name_three, some_long_table_name_four cascade;
drop table t;
drop table if exists a, b cascade;
truncate table some_long_table_name_one, some_long_table_name_two, some_long_table_name_three restart identity cascade;
truncate table only t;
drop trigger if exists some_long_trigger_name_that_is_long on some_long_schema_name.some_long_table_name_value cascade;
drop function if exists some_schema.some_long_function_name(integer, text, boolean), other_schema.another_function_name(integer);
drop index concurrently if exists some_long_index_name_one, some_long_index_name_two, some_long_index_name_three;
drop cast (text as integer);

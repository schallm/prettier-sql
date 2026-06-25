create event trigger log_ddl on ddl_command_start execute procedure log_ddl_func();

create cast (text as integer) with function int4(text) as implicit;

create event trigger log_ddl on ddl_command_start execute procedure log_ddl_func();
create event trigger no_drops on sql_drop when tag in ('DROP TABLE', 'DROP VIEW') execute function public.abort_drop();
create event trigger "Mixed Case" on ddl_command_end when tag in ('CREATE TABLE') and tag in ('it''s') execute function f();

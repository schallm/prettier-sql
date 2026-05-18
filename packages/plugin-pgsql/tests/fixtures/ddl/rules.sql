create rule log_insert as on insert to orders do also insert into audit_log (event) values ('insert');

create rule log_insert as on insert to orders do also insert into audit_log (event) values ('insert');

-- DO INSTEAD (redirect writes to archive)
create rule redirect_update as on update to archived_orders do instead nothing;

-- INSTEAD OF (on a view)
create rule insert_view as on insert to user_view do instead insert into users (name, email) values (new.name, new.email);

-- BEFORE rule with condition
create rule no_delete as on delete to orders where old.status = 'locked' do instead nothing;

-- Multiple actions (DO ALSO with multiple statements)
create rule audit_delete as on delete to orders do also insert into audit_log (event, record_id) values ('delete', old.id);

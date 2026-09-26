-- Column lists, GRANT OPTION FOR, GRANTED BY and pseudo-roles
grant select, insert (a, "B"), update (c) on t to r with grant option;
grant all privileges on table t to "Role Name", public;
grant select on t to current_user, session_user;
grant select on t to r granted by current_user;
revoke grant option for select on t from r cascade;
revoke update (c) on t from r;
grant usage on schema s to r;
grant select on all tables in schema s to r;
grant execute on function f(int) to r;

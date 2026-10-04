create role some_long_role_name login password 'secret' valid until '2030-01-01' in role admins sysid 100 role trainee1, trainee2 admin mentor;
create role short_role login password 'secret';
alter role some_long_role_name with nosuperuser nocreatedb nocreaterole noinherit nologin noreplication nobypassrls connection limit 5;
create user u2 with password 'p' createdb;

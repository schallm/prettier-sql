-- CREATE ROLE
create role alice login password 'secret' nosuperuser;

-- CREATE USER
create user bob nosuperuser nologin;

-- ALTER ROLE
alter role alice createdb;

alter role bob connection limit 10;

-- Password literals are never recased, and embedded quotes stay escaped
create role carol login password 'MixedCase''Pwd';

-- VALID UNTIL, IN ROLE, ROLE, ADMIN, SYSID
create role dave with login password 'x' valid until '2030-01-01' in role admins sysid 100 role trainee1, trainee2 admin mentor;

-- ALTER ROLE with VALID UNTIL
alter role alice with password 'y' valid until '2031-01-01' connection limit 5;

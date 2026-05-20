-- CREATE ROLE
create role alice login password 'secret' nosuperuser;

-- CREATE USER
create user bob nosuperuser nologin;

-- ALTER ROLE
alter role alice createdb;

alter role bob connection limit 10;

-- AUTHORIZATION with a named role, or one of the role keywords
create schema reporting authorization report_owner;
create schema reporting authorization current_role;
create schema if not exists reporting authorization session_user;

-- Without a name, the schema is named after the role
create schema authorization current_user;
create schema authorization report_owner
  create table reports (id int)
  create view recent as select * from reports;

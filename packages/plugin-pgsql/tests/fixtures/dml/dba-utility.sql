-- DISCARD
discard all;
discard plans;
discard sequences;
discard temp;

-- CHECKPOINT
checkpoint;

-- LOAD
load 'my_extension';

-- ALTER SYSTEM
alter system set work_mem = '256MB';
alter system set search_path = myschema, public;
alter system reset work_mem;
alter system reset all;

-- REASSIGN OWNED
reassign owned by old_role to postgres;
reassign owned by role1, role2 to new_owner;

-- DROP OWNED
drop owned by old_role;
drop owned by role1, role2 cascade;

-- CREATE TABLESPACE
create tablespace fastspace location '/ssd/data';
create tablespace fastspace owner admin location '/ssd/data';

-- DROP TABLESPACE
drop tablespace fastspace;
drop tablespace if exists fastspace;

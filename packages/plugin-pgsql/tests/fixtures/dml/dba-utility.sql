-- DISCARD
discard all;
discard plans;
discard sequences;
discard temp;

-- CHECKPOINT
checkpoint;

-- LOAD
load 'my_extension';
-- an embedded quote in the filename must round-trip escaped, or it doesn't parse
load 'it''s.so';

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
create tablespace fast_ssd owner admin location '/mnt/ssd' with (seq_page_cost = 0.5, random_page_cost = 1.1);
create tablespace fastspace owner admin location '/ssd/data';
-- an embedded quote in the location must round-trip escaped, or it doesn't parse
create tablespace fastspace location '/ssd/it''s';

-- DROP TABLESPACE
drop tablespace fastspace;
drop tablespace if exists fastspace;

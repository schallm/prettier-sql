create publication my_pub
  for table orders, users;

-- column list, WHERE, TABLES IN SCHEMA, and WITH options
create publication p2
  for table t (a, b) where (a > 0), tables in schema s
  with (publish = 'insert');

create publication p3
  for tables in schema current_schema;

create subscription my_sub
  connection 'host=localhost dbname=mydb'
  publication my_pub;

-- an embedded quote in the conninfo must round-trip escaped, or it doesn't parse
create subscription my_sub_quote
  connection 'host=localhost application_name=it''s'
  publication my_pub;

create subscription my_sub2
  connection 'host=localhost dbname=mydb'
  publication my_pub
  with (enabled = false, slot_name = 'my_slot');

drop subscription my_sub;

drop subscription if exists my_sub2 cascade;

-- ALTER PUBLICATION: object list forms and the reloption-only form
alter publication my_pub add table t1, t2;
alter publication my_pub set table t1 (a, b) where (a > 0);
alter publication my_pub drop table t1;
alter publication my_pub set (publish = 'insert, update');

-- ALTER SUBSCRIPTION: every form
alter subscription my_sub connection 'host=localhost dbname=mydb2';
alter subscription my_sub set publication p1, p2 with (refresh = false);
alter subscription my_sub add publication p3;
alter subscription my_sub drop publication p3;
alter subscription my_sub refresh publication;
alter subscription my_sub refresh publication with (copy_data = false);
alter subscription my_sub enable;
alter subscription my_sub disable;
alter subscription my_sub set (slot_name = none);
alter subscription my_sub skip (lsn = '0/0');
alter subscription my_sub rename to my_sub3;
alter subscription my_sub owner to new_owner;

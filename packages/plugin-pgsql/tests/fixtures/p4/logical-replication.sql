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

drop subscription my_sub;

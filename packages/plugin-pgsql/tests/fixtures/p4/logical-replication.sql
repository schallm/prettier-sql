create publication my_pub
  for table orders, users;

create subscription my_sub
  connection 'host=localhost dbname=mydb'
  publication my_pub;

drop subscription my_sub;

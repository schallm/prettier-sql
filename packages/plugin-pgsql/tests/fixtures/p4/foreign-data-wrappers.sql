create server my_server
  foreign data wrapper postgres_fdw
  options (host 'localhost', port '5432');

create foreign table remote_orders (
  id integer,
  amount numeric
)
  server my_server
  options (table_name 'orders');

-- column-level OPTIONS
create foreign table remote_items (
  id integer options (column_name 'item_id'),
  amount numeric
)
  server my_server
  options (table_name 'items');

create user mapping for current_user
  server my_server
  options (user 'remote_user', password 'secret');

import foreign schema public
  from server my_server
  into local_schema;

import foreign schema public
  limit to (t1, t2)
  from server my_server
  into local_schema
  options (import_default 'true');

import foreign schema public
  except (t3)
  from server my_server
  into local_schema;

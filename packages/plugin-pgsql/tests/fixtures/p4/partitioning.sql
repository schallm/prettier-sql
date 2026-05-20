create table orders (
  id integer not null,
  region text not null
)
partition by range (region);

create table orders_us
  partition of orders
  for values from ('US') to ('ZZ');

create table orders_default
  partition of orders
  default;

create table measurements (
  city_id integer not null,
  logdate date not null
)
partition by list (city_id);

-- HASH partitioning
create table events (
  id integer not null,
  user_id integer not null
)
partition by hash (user_id);

create table events_0
  partition of events
  for values with (modulus 4, remainder 0);

create table events_1
  partition of events
  for values with (modulus 4, remainder 1);

-- LIST partition with IN bounds
create table orders_eu
  partition of orders
  for values in ('DE', 'FR', 'UK');

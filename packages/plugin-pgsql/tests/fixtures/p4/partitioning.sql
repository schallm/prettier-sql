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

-- sub-partitioned: PARTITION OF ... PARTITION BY
create table orders_apac
  partition of orders
  for values in ('AU', 'JP')
  partition by range (region);

-- MODULUS 0 parses (PostgreSQL rejects it when run): its bound is kept
create table orders_bad partition of orders_by_hash for values with (modulus 0, remainder 1);

-- A key that's a call with OVER or FILTER keeps its parentheses (PostgreSQL rejects it when run, but it parses)
create table scores (player int, points int) partition by range ((avg(points) over (partition by player)));

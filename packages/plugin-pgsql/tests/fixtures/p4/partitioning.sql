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

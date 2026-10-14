-- PostgreSQL 18: virtual generated columns (the default when neither is written)
create table orders (
  net numeric not null,
  tax numeric generated always as (net * 0.2) virtual,
  gross numeric generated always as (net * 1.2) stored,
  cents bigint generated always as ((net * 100)::bigint)
);

-- NOT ENFORCED check and foreign key constraints
create table shipments (
  id integer primary key,
  order_id integer references orders (id) not enforced,
  weight numeric check (weight > 0) not enforced,
  constraint shipments_order_fk foreign key (order_id) references orders (id) deferrable not enforced,
  check (weight < 1000) enforced
);
alter table shipments add constraint light check (weight < 100) not enforced;
alter table shipments add constraint heavy check (weight > 1) not valid;

-- Temporal keys: WITHOUT OVERLAPS and PERIOD
create table rooms (
  room_id integer,
  booked tstzrange,
  constraint rooms_pk primary key (room_id, booked without overlaps),
  unique (room_id, booked without overlaps)
);
create table bookings (
  room_id integer,
  booked tstzrange,
  foreign key (room_id, period booked) references rooms (room_id, period booked)
);

-- Named table-level NOT NULL constraints
create table people (
  id integer,
  name text,
  constraint people_id_nn not null id,
  constraint people_name_nn not null name no inherit
);

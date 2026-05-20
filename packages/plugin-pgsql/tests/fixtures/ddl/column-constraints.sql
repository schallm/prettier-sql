-- NOT NULL, PRIMARY KEY, UNIQUE, DEFAULT
create table orders (
  id integer primary key,
  customer_id integer not null,
  status text default 'pending',
  code text unique,
  amount numeric(10, 2) not null
);

-- CHECK constraint
create table products (
  id integer primary key,
  price numeric(10, 2) check (price > 0),
  quantity integer check (quantity >= 0)
);

-- FOREIGN KEY — column-level
create table order_items (
  id integer primary key,
  order_id integer references orders (id) on delete cascade,
  product_id integer references products (id) on update restrict
);

-- FOREIGN KEY — table-level
create table order_items2 (
  id integer,
  order_id integer,
  primary key (id),
  foreign key (order_id) references orders (id)
);

-- Named constraint
create table employees (
  id integer,
  salary numeric(10, 2),
  constraint employees_pkey primary key (id),
  constraint salary_positive check (salary > 0)
);

-- GENERATED columns
create table sales (
  id integer primary key,
  quantity integer not null,
  unit_price numeric(10, 2) not null,
  total numeric generated always as (quantity * unit_price) stored
);

-- IDENTITY column
create table seq_test (
  id integer generated always as identity,
  name text
);

-- DEFERRABLE constraints
create table transfers (
  id integer primary key,
  from_account integer,
  to_account integer,
  constraint fk_from foreign key (from_account) references accounts (id) deferrable initially deferred,
  constraint fk_to foreign key (to_account) references accounts (id) deferrable initially immediate
);

# Formatting Reference

Comprehensive formatting rules organized by statement type. All examples use default options (lowercase keywords, standard density, trailing commas) unless noted.

---

## SELECT

### Column list

Each selected column is placed on its own indented line. A trailing comma follows each column except the last (or a leading comma precedes each when `sqlCommaStyle: 'leading'`).

```sql
select
  id,
  title,
  price,
  author_id
from books;
```

### WHERE (single condition)

Single-condition WHERE stays on one line with the keyword.

```sql
select
  id,
  title
from books
where price < 50;
```

### WHERE (multiple conditions)

Multiple conditions break to indented lines with `AND` / `OR` at the start of each continuation.

```sql
select
  id,
  title
from books
where
  price < 50
  and in_stock = true
  and author_id = 3;
```

### JOIN types

All JOIN types are supported. `INNER JOIN` is normalised to `JOIN`. Each JOIN goes on its own line at the same indent level as `FROM`.

```sql
select *
from
  books
  join authors on authors.id = books.author_id
  left join categories on categories.id = books.category_id
  right join publishers on publishers.id = books.publisher_id
  full join orders on orders.book_id = books.id
  cross join tags
  natural join reviews;
```

### JOIN condition — ON vs USING

```sql
-- ON
join authors on authors.id = books.author_id

-- USING
join authors using (author_id)
```

### Subquery in FROM

Subqueries are indented inside parentheses. The alias follows the closing paren.

```sql
select sub.avg_price
from (
  select avg(price) as avg_price
  from books
) as sub;
```

### LATERAL

`LATERAL` precedes the subquery.

```sql
select
  b.id,
  r.avg_price
from
  books as b,
  lateral (
    select avg(price) as avg_price
    from books
    where author_id = b.author_id
  ) as r;
```

### TABLESAMPLE

The `TABLESAMPLE` method and percentage follow the table name on the same line. The optional `REPEATABLE` seed is appended inline.

```sql
select
  id,
  title
from books tablesample bernoulli(10);

select count(*)
from orders tablesample system(5) repeatable (42);
```

### DISTINCT

```sql
select distinct
  author_id,
  title
from books;
```

### DISTINCT ON

```sql
select distinct on (author_id)
  id,
  author_id,
  title
from books
order by
  author_id,
  price asc;
```

### GROUP BY

```sql
select
  genre_id,
  author_id,
  sum(price)
from books
group by
  genre_id,
  author_id;
```

### HAVING

```sql
select
  genre_id,
  sum(price)
from books
group by genre_id
having sum(price) > 5000;
```

### ROLLUP

```sql
select
  genre_id,
  author_id,
  sum(price)
from books
group by rollup(genre_id, author_id);
```

### CUBE

```sql
select
  genre_id,
  author_id,
  sum(price)
from books
group by cube(genre_id, author_id);
```

### GROUPING SETS

Multi-column groupings use parentheses inside `GROUPING SETS`. Single-column groups are also wrapped in parens for consistency.

```sql
select
  genre_id,
  author_id,
  sum(price)
from books
group by grouping sets((genre_id, author_id), (genre_id), ());
```

### ORDER BY

```sql
select
  id,
  title,
  price
from books
order by
  price desc,
  title asc;
```

### LIMIT / OFFSET

```sql
select
  id,
  title
from books
order by price
limit 10
offset 20;
```

### CTEs — WITH

Each CTE is indented inside its own `as (...)` block. Multiple CTEs are separated by commas.

```sql
with
  active_users as (
    select
      id,
      name
    from customers
    where active = true
  ),
  recent_orders as (
    select
      customer_id,
      sum(amount) as total
    from orders
    where created_at > now() - interval '30 days'
    group by customer_id
  )
select
  u.name,
  ro.total
from
  active_users as u
  join recent_orders as ro on u.id = ro.customer_id;
```

### WITH RECURSIVE

```sql
with recursive
  org_tree as (
    select
      id,
      name,
      parent_id,
      0 as depth
    from publishers
    where parent_id is null
    union all
    select
      publishers.id,
      publishers.name,
      publishers.parent_id,
      org_tree.depth + 1
    from
      publishers
      join org_tree on publishers.parent_id = org_tree.id
  )
select
  id,
  name,
  depth
from org_tree
order by
  depth,
  name;
```

### Recursive CTE — SEARCH and CYCLE

`SEARCH` and `CYCLE` clauses attach to the CTE name, each on its own line, using the same indent as the `as (...)` body.

```sql
with recursive
  t as (
    select
      id,
      parent_id
    from tree
    union all
    select
      tree.id,
      tree.parent_id
    from
      tree
      join t on t.id = tree.parent_id
  )
  search breadth first by id set ordercol
  cycle id set is_cycle using path
select *
from t;
```

### Named WINDOW clause

Define reusable window specifications with a `WINDOW` clause. Window names are referenced by name in `OVER` expressions elsewhere in the same query.

```sql
select
  id,
  dept,
  salary,
  row_number() over w1 as dept_rank,
  sum(salary) over w2 as dept_total,
  avg(salary) over (partition by dept) as dept_avg
from employees
window
  w1 as (partition by dept order by salary desc),
  w2 as (partition by dept);
```

### Set operations (UNION / INTERSECT / EXCEPT)

The set operator is placed on its own line between the two queries.

```sql
select
  id,
  name
from customers
union
select
  id,
  title as name
from archived_books;
```

`UNION ALL`:

```sql
select
  id,
  title
from books
union all
select
  id,
  title
from archived_books;
```

### Subquery (scalar and correlated)

```sql
select
  id,
  name
from customers
where exists (
  select 1
  from orders
  where orders.customer_id = customers.id
);
```

```sql
select
  id,
  (
    select count(*)
    from orders
    where customer_id = customers.id
  ) as order_count
from customers;
```

### Window functions

Window functions print inline. The OVER clause with PARTITION BY, ORDER BY, and frame specification follows the function call.

```sql
select
  id,
  author_id,
  price,
  row_number() over (partition by author_id order by price desc) as rank,
  sum(price) over (partition by author_id rows between unbounded preceding and current row) as running_total
from books;
```

Frame clause variants:

```sql
-- ROWS frame
sum(price) over (order by id rows between unbounded preceding and current row)

-- RANGE frame
avg(price) over (order by price range between unbounded preceding and current row)

-- GROUPS frame
count(*) over (order by genre_id groups between 1 preceding and 1 following)
```

### Aggregate FILTER

```sql
select
  count(*) filter (where in_stock = true) as in_stock_count,
  count(*) filter (where in_stock = false) as out_of_stock_count
from books;
```

### ORDER BY inside aggregate

```sql
select
  author_id,
  string_agg(title, ', ' order by title) as titles,
  array_agg(price order by price desc) as prices
from books
group by author_id;
```

### FOR UPDATE / FOR SHARE

```sql
-- Basic locking
select
  id,
  title
from books
for update;

-- Skip locked rows
select id
from orders
for update skip locked;

-- No-wait
select id
from orders
for no key update nowait;

-- Lock specific table
select id
from orders
for update of orders;

-- FOR KEY SHARE
select id
from books
for key share;
```

### IN / NOT IN

```sql
select
  id,
  title
from books
where author_id in (1, 2, 3);
```

### BETWEEN / NOT BETWEEN

```sql
select
  id,
  title,
  price
from books
where price between 10.00 and 50.00;
```

### LIKE / NOT LIKE / ILIKE / NOT ILIKE / SIMILAR TO

```sql
select
  id,
  title
from books
where
  title ilike '%postgres%'
  and isbn not like '978-0%';
```

### ANY / ALL

```sql
select
  id,
  title
from books
where price = any(array[9.99, 19.99, 29.99]);
```

### IS NULL / IS NOT NULL

```sql
select
  id,
  title
from books
where deleted_at is null;
```

### IS DISTINCT FROM

```sql
select id
from books
where price is distinct from 0;
```

### CASE expression

```sql
select
  id,
  case
    when price < 10 then 'budget'
    when price < 50 then 'mid-range'
    when price < 100 then 'premium'
  else 'luxury'
  end as price_tier
from books;
```

### SELECT INTO

Creates a new table populated with the result of a query. The new table takes its column structure from the query's output.

```sql
select
  id,
  name
into
  archive_users
from users
where active = false;
```

---

## INSERT

### Single-row VALUES

```sql
insert into orders (customer_id, total)
values (1, 99.99);
```

### Multi-row VALUES

```sql
insert into books (title, price, genre_id)
values
  ('The Pragmatic Programmer', 49.99, 1),
  ('Clean Code', 39.99, 1),
  ('Dune', 14.99, 2);
```

### INSERT ... SELECT

```sql
insert into archived_orders (id, customer_id, amount)
select
  id,
  customer_id,
  amount
from orders
where status = 'closed';
```

### DEFAULT VALUES

```sql
insert into reviews
default values;
```

### ON CONFLICT DO NOTHING

```sql
insert into customers (id, email)
values (1, 'alice@example.com')
on conflict do nothing;
```

### ON CONFLICT DO UPDATE

```sql
insert into customers (id, email)
values (1, 'alice@example.com')
on conflict (id) do update
set email = excluded.email;
```

### RETURNING

```sql
insert into orders (customer_id, amount)
values (42, 150.00)
returning
  id,
  created_at;
```

### OVERRIDING SYSTEM VALUE

```sql
insert into customers (id, email) overriding system value
values (100, 'admin@example.com');
```

### INSERT with CTE

```sql
with
  new_data as (
    select
      customer_id,
      sum(amount) as total
    from raw_orders
    group by customer_id
  )
insert into order_summary (customer_id, total)
select
  customer_id,
  total
from new_data;
```

---

## UPDATE

### Basic UPDATE

```sql
update customers
set active = false
where last_order_at < now() - interval '1 year';
```

### UPDATE with RETURNING

```sql
update customers
set active = false
where last_order_at < now() - interval '1 year'
returning
  id,
  email;
```

### UPDATE with CTE

```sql
update orders
set status = 'archived'
where (
  select id
  from stale
);
```

---

## DELETE

### Basic DELETE

```sql
delete from orders
where placed_at < now() - interval '1 year';
```

### DELETE with RETURNING

```sql
delete from orders
where placed_at < now() - interval '1 year'
returning
  id,
  customer_id;
```

### Data-modifying CTE

The DELETE (or INSERT/UPDATE) result is consumed by a subsequent statement.

```sql
with
  moved as (
    delete from orders
    where status = 'cancelled'
    returning
      id,
      customer_id,
      amount
  )
insert into archived_orders (id, customer_id, amount)
select
  id,
  customer_id,
  amount
from moved;
```

---

## TRUNCATE

```sql
truncate table orders;

truncate table orders, archived_books restart identity cascade;
```

---

## DDL

### CREATE TABLE (partitioned)

`PARTITION BY` is emitted on a new line after the column list closing paren.

```sql
create table orders (
  id integer not null,
  region text not null
)
partition by range (region);

create table order_items_2024 (
  order_id integer not null,
  book_id integer not null
)
partition by range (order_id);
```

### CREATE TABLE ... PARTITION OF

The `PARTITION OF` header and bounds each occupy their own line. Default partitions use `DEFAULT`.

```sql
create table orders_us
partition of orders
for values from ('US') to ('ZZ');

create table orders_default
partition of orders
default;
```

### CREATE TABLE LIKE

`LIKE` clauses appear inline within the column list. Multiple `INCLUDING` options are chained on the same line.

```sql
create table orders_copy (
  like orders including all
);

create table orders_partial (
  extra_col text,
  like orders including defaults including indexes
);
```

### CREATE TABLE (standard)

Column definitions include the full constraint set. Type names use SQL standard aliases (`integer` not `int4`, `bigint` not `int8`, etc.).

```sql
create table orders (
  id integer primary key,
  customer_id integer not null references customers (id) on delete cascade,
  status text default 'pending' check (status in ('pending', 'shipped', 'cancelled')),
  amount numeric(10, 2) not null,
  code text unique,
  name varchar(100),
  tags text[],
  created_at timestamptz
);
```

Table-level constraints and named constraints:

```sql
create table order_items (
  id integer,
  order_id integer,
  product_id integer,
  constraint order_items_pkey primary key (id),
  constraint fk_order foreign key (order_id) references orders (id),
  constraint positive_qty check (quantity > 0)
);
```

Generated columns and identity columns:

```sql
create table sales (
  id integer generated always as identity,
  quantity integer not null,
  unit_price numeric(10, 2) not null,
  total numeric generated always as (quantity * unit_price) stored
);
```

### ALTER TABLE

#### Rename column / table

```sql
alter table users rename column email to email_address;

alter table users rename to customers;
```

#### Alter column

```sql
-- Change type
alter table products
  alter column price type numeric(12, 4);

-- Set / drop default
alter table users
  alter column active set default true;

alter table users
  alter column active drop default;

-- Set / drop not null
alter table orders
  alter column status set not null;

alter table orders
  alter column notes drop not null;
```

#### Add / drop column

```sql
alter table users
  add column phone text;

alter table users
  add column verified boolean not null default false;

alter table users
  drop column phone;

alter table users
  drop column if exists legacy_field;
```

#### Add / drop constraint

```sql
alter table order_items
  add constraint fk_order foreign key (order_id) references orders (id);

alter table products
  add constraint price_positive check (price > 0);

alter table users
  add constraint users_email_unique unique (email);

alter table products
  drop constraint price_positive;

alter table products
  drop constraint old_check;
```

### CREATE / REPLACE VIEW

```sql
create view active_customers
as
select
  id,
  name,
  email
from customers
where active = true;
```

Optional column aliases immediately after the view name:

```sql
create view order_summary
as
select
  id,
  amount,
  status
from orders;
```

`CREATE OR REPLACE VIEW` preserves existing grants and other dependencies:

```sql
create view active_users
as
select
  id,
  name,
  email
from users
where
  active = true
  and deleted_at is null;
```

### Materialized Views

A materialized view stores the query result on disk. It must be refreshed explicitly.

```sql
create materialized view user_stats as
select
  user_id,
  count(*) as order_count,
  sum(amount) as total_spent
from orders
group by user_id;
```

`REFRESH MATERIALIZED VIEW` re-executes the query and replaces the stored data. The `CONCURRENTLY` option allows reads during the refresh (requires a unique index on the view):

```sql
refresh materialized view user_stats;

refresh materialized view concurrently user_stats;
```

```sql
drop materialized view if exists stale_cache;
```

### CREATE INDEX

```sql
create index idx_books_author on books (author_id);

create unique index idx_customers_email on customers (email);
```

Expression index (index on a function of a column):

```sql
create index idx_users_lower_email on users (lower(email));
```

Covering index with `INCLUDE` columns (available from PostgreSQL 11):

```sql
create index idx_orders_lookup on orders (customer_id) include (status, amount);
```

Index method with `USING`:

```sql
create index idx_events_data on events using gin (data);

create index idx_locations on places using gist (location);
```

`CONCURRENTLY` builds the index without locking writes:

```sql
create index concurrently idx_big_table_col on big_table (col);
```

`IF NOT EXISTS` avoids an error when the index already exists:

```sql
create index if not exists idx_books_author on books (author_id);
```

### CREATE FUNCTION

```sql
create function get_book_count(p_author_id integer)
returns bigint
language sql
as $$
  select count(*) from books where author_id = p_author_id
$$;
```

### DROP

```sql
drop table if exists archived_books;

drop view active_customers;

drop index if exists idx_books_author;
```

### VACUUM / ANALYZE / CLUSTER / REINDEX

Maintenance statements. Options are emitted in parentheses when present.

```sql
vacuum orders;

vacuum verbose orders;

vacuum (full, analyze) orders;

analyze orders;

cluster orders using orders_region_idx;

reindex table orders;

reindex (verbose) table orders;
```

### Foreign data wrappers

`OPTIONS (...)` lists are emitted inline. The `FOREIGN DATA WRAPPER` phrase follows on a new line for `CREATE SERVER`.

```sql
create server my_server
foreign data wrapper postgres_fdw options (host 'localhost', port '5432');

create foreign table remote_orders (
  id integer,
  amount numeric
)
server my_server options (table_name 'orders');

create user mapping for current_user
server my_server options (user 'remote_user', password 'secret');

import foreign schema public
from server my_server
into local_schema;
```

### Logical replication

```sql
create publication my_pub
for table orders, customers;

create subscription my_sub
connection 'host=localhost dbname=mydb'
publication my_pub;

drop subscription my_sub;
```

### CREATE AGGREGATE

Parameters are listed one per line in the `(...)` block, using `=` assignment.

```sql
create aggregate my_avg (double precision) (
  sfunc = float8_accum,
  stype = double precision[],
  initcond = '{0,0,0}'
);
```

### CREATE OPERATOR

```sql
create operator === (
  leftarg = integer,
  rightarg = integer,
  procedure = int4eq
);
```

### CREATE COLLATION

```sql
create collation my_coll (locale = 'en-US');

create collation my_coll2 from "en-US";
```

### SECURITY LABEL

```sql
security label for my_provider on table orders is 'sensitive';

security label for my_provider on column orders.amount is 'pii';
```

### CREATE / ALTER SEQUENCE

Each option appears on its own indented line:

```sql
create sequence order_seq
start with 1000
increment by 1
no maxvalue
no cycle;
```

Minimal sequence (all defaults):

```sql
create sequence event_seq;
```

`ALTER SEQUENCE` uses `RESTART WITH` to reset the current value:

```sql
alter sequence order_seq
restart with 1
increment by 5;
```

### CREATE TYPE

#### Composite type

```sql
create type address as (
  street text,
  city varchar(100),
  zip varchar(10)
);
```

#### Enum type

```sql
create type mood as enum (
  'sad',
  'ok',
  'happy'
);
```

#### ALTER TYPE

```sql
alter type mood add value 'excited' after 'happy';

alter type mood add value if not exists 'meh' before 'ok';
```

### CREATE TRIGGER

The trigger name, timing/event, target table, scope, optional `WHEN` condition, and function call each appear on their own line:

```sql
-- BEFORE INSERT
create trigger check_before_insert
before insert on accounts
for each row
execute function check_account_insert();

-- AFTER UPDATE (statement-level)
create trigger log_update
after update on accounts
for each statement
execute function log_account_change();

-- Multiple events
create trigger validate_order
before insert or update on orders
for each row
execute function validate_order_data();

-- WHEN condition (row-level only)
create trigger audit_price_change
before update on products
for each row
when (old.price is distinct from new.price)
execute function audit_price();

-- INSTEAD OF trigger on a view
create trigger view_insert
instead of insert on v_active_users
for each row
execute function handle_view_insert();

-- Constraint trigger (deferrable)
create trigger check_fk
after insert on order_items
for each row
execute function check_order_item_fk();
```

### Row Level Security

#### CREATE POLICY

```sql
-- SELECT policy — USING clause filters visible rows
create policy view_own_data
on users
for select
using (user_id = current_user_id());

-- INSERT policy — WITH CHECK validates new rows
create policy insert_own_rows
on orders
for insert
with check (customer_id = current_user_id());

-- USING and WITH CHECK together
create policy manage_own_orders
on orders
for all
using (customer_id = current_user_id())
with check (customer_id = current_user_id());

-- Permissive vs restrictive
create policy admin_all
on orders
for all
using (true);

create policy restrict_sensitive
on users
for all
using (not is_internal);
```

#### ALTER POLICY

```sql
alter policy view_own_data
on users
using (user_id = current_user_id());
```

### CREATE / ALTER ROLE

```sql
create role alice
login password 'secret' nosuperuser;

create user bob
nosuperuser nologin;

alter role alice
createdb;

alter role bob
connection limit 10;
```

### GRANT / REVOKE

```sql
-- GRANT permissions on a table
grant select, insert on table books
to alice;

grant all privileges on table orders
to bob;

-- GRANT on schema
grant usage on schema myschema
to alice;

-- GRANT on all tables in schema
grant select on all tables in schema public
to alice;

-- GRANT on a function
grant execute on function get_count
to PUBLIC;

-- WITH GRANT OPTION
grant select on table books
to alice
with grant option;

-- REVOKE
revoke select on table books
from alice;

revoke all privileges on table orders
from bob
cascade;
```

### COMMENT ON

Attaches a description string to any database object. Set to `NULL` to remove a comment.

```sql
comment on table books is 'Book catalog';

comment on column books.title is 'The book''s title';

comment on schema public is 'Public schema';

comment on function get_count is 'Returns count for given id';

comment on view active_users is 'Users with active accounts';

comment on index idx_books_author is 'Author lookup index';

comment on sequence order_seq is 'Order ID sequence';

comment on type order_status is 'Possible order states';

comment on database mydb is 'Main application database';

-- Remove a comment
comment on table temp_data is null;
```

### CREATE RULE

Rules redirect or suppress DML operations on a table or view. The action (`DO ALSO` or `DO INSTEAD`) and body appear on their own lines:

```sql
create rule log_insert
as on insert
to orders
do also
  insert into audit_log (event)
  values ('insert');

-- DO INSTEAD with NOTHING suppresses the original operation
create rule redirect_update
as on update
to archived_orders
do instead nothing;

-- INSTEAD OF on a view (rewrite to base table)
create rule insert_view
as on insert
to user_view
do instead
  insert into users (name, email)
  values (new.name, new.email);

-- With a WHEN condition
create rule no_delete
as on delete
to orders
where old.status = 'locked'
do instead nothing;
```

### CREATE SCHEMA / CREATE EXTENSION

```sql
create schema myschema;

create schema if not exists reporting;

create schema myschema authorization alice;
```

```sql
create extension "uuid-ossp";

create extension if not exists "pgcrypto";
```

### ALTER FUNCTION

```sql
alter function get_count(integer)
  cost 100;

alter function get_books(integer)
  rows 100;

-- Volatility
alter function compute_tax(numeric)
  volatile;

alter function get_config(text)
  stable;

alter function format_name(text, text)
  immutable;

-- Rename / owner / schema
alter function get_count(integer) rename to count_items;

alter function get_count owner to admin;

alter function get_count set schema reporting;
```

---

## Transaction Control

All standard transaction statements are supported.

```sql
begin;

commit;

rollback;

savepoint my_save;

release savepoint my_save;

rollback to savepoint my_save;
```

`SET TRANSACTION` with options:

```sql
set transaction isolation level serializable;

set transaction read only;

set transaction read write, deferrable;
```

`BEGIN` with inline options:

```sql
begin isolation level read committed;

begin read only;
```

Two-phase commit:

```sql
prepare transaction 'txn-1234';

commit prepared 'txn-1234';

rollback prepared 'txn-1234';
```

---

## MERGE

`MERGE INTO ... USING ... ON ...` with one or more `WHEN` clauses. Supported actions: `UPDATE SET`, `INSERT`, `DELETE`, `DO NOTHING`. Conditional `AND` clause is supported.

```sql
merge into target as t
using source as s
on t.id = s.id
when matched then
  update set
    name = s.name,
    updated_at = now()
when not matched then
  insert (id, name)
  values (s.id, s.name);
```

`WHEN NOT MATCHED BY SOURCE` (PostgreSQL 15+):

```sql
merge into employees as e
using new_roster as nr
on e.id = nr.id
when matched then
  update set
    name = nr.name
when not matched by source then
  delete;
```

---

## CALL

Stored-procedure invocation with positional or named arguments.

```sql
call process_orders();

call update_inventory(product_id => 42, delta => -5);
```

---

## DO

Anonymous PL/pgSQL (or SQL) blocks. The body is preserved verbatim inside `$$` delimiters.

```sql
do $$
BEGIN
  RAISE NOTICE 'hello';
END
$$
language plpgsql;
```

---

## Session / Utility Statements

### EXPLAIN

`EXPLAIN` shows the query plan without executing. `EXPLAIN ANALYZE` executes and reports timing.

```sql
explain select id
from users;

explain analyze select id
from users;

explain (analyze true, verbose true, format json) select id
from users;
```

---

### COPY

`COPY` transfers data between a table and a file. The `FROM` form loads data; `TO` exports it. A subquery can be used in the `TO` form.

```sql
copy orders from '/tmp/orders.csv';

copy orders to '/tmp/orders.csv';

copy (
  select id
  from orders
) to '/tmp/ids.csv';
```

With options:

```sql
copy orders from '/tmp/orders.csv' (format csv, header true, delimiter ',', null '');

copy orders (id, customer_id, amount) to '/tmp/orders_partial.csv' (format csv, header true);
```

---

### SET / SHOW / RESET

```sql
-- SET a session parameter
set search_path = public, myschema;

set work_mem = '64MB';

-- SET LOCAL applies only within the current transaction
set local client_encoding = utf8;

-- SET TO DEFAULT restores the compiled-in value
set work_mem to default;

-- RESET is equivalent to SET TO DEFAULT
reset search_path;

reset all;

-- SHOW displays the current effective value
show work_mem;

show all;
```

---

### LOCK TABLE

```sql
lock table orders in exclusive mode;

lock table orders in access exclusive mode nowait;
```

---

### LISTEN / NOTIFY / UNLISTEN

```sql
listen my_channel;

unlisten my_channel;

unlisten *;

notify my_channel;

notify my_channel, 'payload text';
```

---

### Cursors

```sql
declare my_cursor cursor for
select
  id,
  name
from users;

declare scroll_cursor scroll cursor for
select id
from orders;

fetch next from my_cursor;

fetch forward 10 from my_cursor;

fetch all from my_cursor;

move prior from scroll_cursor;

close my_cursor;
```

---

### PREPARE / EXECUTE / DEALLOCATE

```sql
prepare get_user(integer) as
select
  id,
  name
from users
where id = $1;

execute get_user(42);

deallocate get_user;

deallocate all;
```

---

## Expressions

### SUBSTRING — SQL standard form

Regex extraction (two-argument FROM form) and positional extraction (FROM/FOR form) are both reconstructed from the normalized parse tree.

```sql
-- Regex extraction
substring(title from 'pg[a-z]+')

-- Positional extraction
substring(title from 1 for 5)
```

### EXTRACT

The field name is rendered as a keyword, not a quoted string.

```sql
extract(year from created_at)
extract(month from created_at)
extract(day from created_at)
extract(epoch from now())
```

### TRIM

Directional forms use SQL standard syntax. The single-argument form (trim spaces) uses shorthand.

```sql
-- With direction and characters
trim(leading ' ' from name)
trim(trailing ' ' from name)
trim(both ' ' from name)

-- Without characters (trims spaces)
ltrim(name)
rtrim(name)
trim(name)
```

### POSITION

Arguments are rendered in SQL standard order (`needle IN haystack`), reversing the internal function argument order.

```sql
position('.' in email)
```

### AT TIME ZONE

Reconstructed as infix from `pg_catalog.timezone(zone, expr)`.

```sql
created_at at time zone 'UTC'
updated_at at time zone 'America/New_York'
```

### OVERLAY

```sql
overlay(name placing 'XXX' from 2 for 3)
```

### COALESCE / NULLIF / GREATEST / LEAST

```sql
coalesce(price, 0.00)
nullif(status, 'deleted')
greatest(a, b, c)
least(x, y, z)
```

### GROUPING

`GROUPING(col, ...)` returns 0 when all listed columns are part of the current grouping key, or 1 when any of them are being aggregated away. Used with `GROUPING SETS`, `ROLLUP`, and `CUBE` to distinguish subtotals from detail rows.

```sql
select
  region,
  product,
  grouping(region, product) as grp,
  sum(amount)
from sales
group by grouping sets((region, product), (region), ());
```

### Type casting — :: style

All type casts are rendered with PostgreSQL's `::` operator.

```sql
price::numeric
name::text
'2024-01-01'::date
id::text
```

### INTERVAL literals

`INTERVAL '...'` syntax is reconstructed from the type cast parse node. Optional field modifiers (`YEAR`, `MONTH`, `DAY`, `HOUR TO MINUTE`, `DAY TO SECOND`, etc.) are appended after the string.

```sql
interval '1 day'
interval '2 hours 30 minutes'
interval '1 year 3 months'
now() - interval '90 days'

-- with field modifiers
interval '1' year
interval '1:30' hour to minute
interval '1 2:03:04' day to second
interval '5 years' year to month
```

### Array subscripts

Single index and slice forms are both supported.

```sql
arr[1]           -- single element
arr[2:4]         -- slice
arr[:3]          -- open lower bound
arr[1:]          -- open upper bound
```

### Named function arguments

```sql
make_date(year => 2024, month => 1, day => 15)
make_interval(hours => 2, mins => 30)
```

### SQL value functions

These zero-argument keywords are printed without parentheses.

```sql
current_date
current_time
current_timestamp
localtime
localtimestamp
current_user
session_user
current_role
current_schema
current_catalog
```

### JSON operators

JSON operators are passed through as binary expressions.

```sql
data -> 'key'
data ->> 'key'
data #> '{a,b}'
data #>> '{a,b}'
data @> '{"k":1}'
data <@ '{"k":1}'
data ? 'key'
data ?| array['a', 'b']
data ?& array['a', 'b']
```

### XML functions

`XMLELEMENT`, `XMLFOREST`, `XMLCONCAT`, and `XMLPI` are printed using SQL standard syntax. `XMLATTRIBUTES(...)` is reconstructed from the named-argument list.

```sql
xmlelement(name foo, 'bar')

xmlelement(name order, xmlattributes(o.orderid), o.ordername)

xmlforest(title, author as written_by)

xmlconcat(xmlelement(name a, 1), xmlelement(name b, 2))

-- XMLAGG (aggregate function)
xmlagg(xmlelement(name item, title) order by title)
```

### XMLTABLE

`XMLTABLE` is a table-valued function in the `FROM` clause that shreds XML into rows. The row expression and document expression each appear on their own indented line; columns are further indented below the `COLUMNS` keyword.

```sql
select
  t.title,
  t.price,
  t.id
from
  books_xml as src,
  xmltable(
    '/bookstore/book'
    passing src.content
    columns
      title text path '@title',
      price numeric path 'price',
      id for ordinality
  ) as t;
```

Column definitions support `PATH`, `DEFAULT`, and `NOT NULL`:

```sql
select t.title, t.qty
from
  catalog_xml as src,
  xmltable(
    '//item'
    passing src.doc
    columns
      title text path 'title' default 'Unknown',
      qty integer path 'quantity' not null
  ) as t;
```

### SQL/JSON functions (PostgreSQL 16+)

`JSON_QUERY`, `JSON_EXISTS`, and `JSON_VALUE` with optional `RETURNING` type.

```sql
json_query(data, '$.name')

json_exists(data, '$.active')

json_value(data, '$.price' returning numeric)
```

### JSON_TABLE (PostgreSQL 16+)

`JSON_TABLE` is a table-valued function in the `FROM` clause that shreds JSON into rows. The context expression and path appear on separate indented lines; the `COLUMNS (...)` block is further indented.

```sql
select
  t.id,
  t.name,
  t.row_num
from
  documents,
  json_table(
    documents.data,
    '$[*]'
    columns (
      id integer path '$.id',
      name text path '$.name',
      row_num for ordinality
    )
  ) as t;
```

Column types: `FOR ORDINALITY`, `PATH`, `EXISTS PATH`, `FORMAT JSON PATH`, and `NESTED PATH`:

```sql
select t.id, t.active
from
  events,
  json_table(
    events.payload,
    '$'
    columns (
      id integer path '$.id',
      active boolean exists path '$.active'
    )
  ) as t;
```

### ARRAY constructor

```sql
array[1, 2, 3]
array['a', 'b', 'c']
```

### ROW constructor

```sql
(1, 'alice', true)
```

### Parameterized queries

```sql
select
  id,
  email
from customers
where
  id = $1
  and active = $2;
```

---

## Comments

Line comments (`--`) and block comments (`/* */`) are preserved.

A comment that appears immediately before a statement becomes a **leading comment** and is printed on its own line directly above the statement, separated from the previous statement by a single blank line.

```sql
-- single leading comment
select
  id,
  title
from books;

-- comment before second statement
-- multi-line comment block
select id
from orders;
```

A comment on the same line as, or after, the final token of a statement becomes an **inline trailing comment** and is printed at the end of the statement's closing line.

```sql
select id
from customers; -- inline trailing comment
```

---

## Semicolons

Every statement ends with a semicolon. Multiple statements in a file are separated by a blank line.

```sql
select id
from customers;

select id
from orders;
```

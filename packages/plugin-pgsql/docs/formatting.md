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

### CREATE VIEW

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

### CREATE INDEX

```sql
create index idx_books_author on books (author_id);

create unique index idx_customers_email on customers (email);
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

### SQL/JSON functions (PostgreSQL 16+)

`JSON_QUERY`, `JSON_EXISTS`, and `JSON_VALUE` with optional `RETURNING` type.

```sql
json_query(data, '$.name')

json_exists(data, '$.active')

json_value(data, '$.price' returning numeric)
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

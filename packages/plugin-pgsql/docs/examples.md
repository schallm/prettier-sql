# Examples

Before/after formatting examples for common PostgreSQL patterns. All examples use default options (lowercase keywords, standard density, trailing commas).

---

## DML

### Basic SELECT

```diff
- select id,title,price from books where in_stock=true order by price asc;
+ select
+   id,
+   title,
+   price
+ from books
+ where in_stock = true
+ order by
+   price asc;
```

### JOIN

```diff
- select books.id,books.title,authors.first_name,authors.last_name from books inner join authors on books.author_id=authors.id where books.price<50;
+ select
+   books.id,
+   books.title,
+   authors.first_name,
+   authors.last_name
+ from
+   books
+   join authors on authors.id = books.author_id
+ where books.price < 50;
```

### JOIN types

```diff
- select * from books left join authors on authors.id=books.author_id right join publishers on publishers.id=books.publisher_id cross join tags;
+ select
+   *
+ from
+   books
+   left join authors on authors.id = books.author_id
+   right join publishers on publishers.id = books.publisher_id
+   cross join tags;
```

### CASE expression

```diff
- select id, case when price < 10 then 'cheap' when price < 50 then 'mid' else 'expensive' end as tier from books;
+ select
+   id,
+   case
+     when price < 10 then 'cheap'
+     when price < 50 then 'mid'
+   else 'expensive'
+   end as tier
+ from books;
```

### IN / NOT IN

```diff
- select id, title from books where author_id in (1, 2, 3) and status not in ('draft', 'archived');
+ select
+   id,
+   title
+ from books
+ where
+   author_id in (1, 2, 3)
+   and status not in ('draft', 'archived');
```

### BETWEEN

```diff
- select id, title, price from books where price between 10.00 and 50.00;
+ select
+   id,
+   title,
+   price
+ from books
+ where price between 10.00 and 50.00;
```

### LIKE / ILIKE

```diff
- select id, title from books where title ilike '%postgres%' and isbn not like '978-0%';
+ select
+   id,
+   title
+ from books
+ where
+   title ILIKE '%postgres%'
+   and isbn NOT LIKE '978-0%';
```

### EXISTS subquery

```diff
- select id, name from customers where exists (select 1 from orders where orders.customer_id = customers.id);
+ select
+   id,
+   name
+ from customers
+ where exists (
+   select
+     1
+   from orders
+   where orders.customer_id = customers.id
+ );
```

### CTE

```diff
- with recent_orders as (select customer_id, sum(amount) as total from orders where created_at > now() - interval '30 days' group by customer_id) select customers.name, recent_orders.total from customers join recent_orders on customers.id = recent_orders.customer_id order by recent_orders.total desc;
+ with
+   recent_orders as (
+     select
+       customer_id,
+       sum(amount) as total
+     from orders
+     where created_at > now() - interval '30 days'
+     group by
+       customer_id
+   )
+ select
+   customers.name,
+   recent_orders.total
+ from
+   customers
+   join recent_orders on customers.id = recent_orders.customer_id
+ order by
+   recent_orders.total desc;
```

### Window functions

```diff
- select id, author_id, price, row_number() over (partition by author_id order by price desc) as rank, sum(price) over (partition by author_id rows between unbounded preceding and current row) as running_total from books;
+ select
+   id,
+   author_id,
+   price,
+   row_number() over (partition by author_id order by price desc) as rank,
+   sum(price) over (partition by author_id rows between unbounded preceding and current row) as running_total
+ from books;
```

### DISTINCT ON

```diff
- select distinct on (author_id) id, author_id, title from books order by author_id, price asc;
+ select distinct on (author_id)
+   id,
+   author_id,
+   title
+ from books
+ order by
+   author_id,
+   price asc;
```

### Set operations (UNION / INTERSECT / EXCEPT)

```diff
- select id, name from customers union select id, name from prospects;
+ select
+   id,
+   name
+ from customers
+ union
+ select
+   id,
+   name
+ from prospects;
```

### GROUP BY / HAVING

```diff
- select dept, job, sum(salary) from emp group by dept, job having sum(salary) > 100000 order by sum(salary) desc;
+ select
+   dept,
+   job,
+   sum(salary)
+ from emp
+ group by
+   dept,
+   job
+ having sum(salary) > 100000
+ order by
+   sum(salary) desc;
```

### ROLLUP / CUBE / GROUPING SETS

```diff
- select dept, job, sum(salary) from emp group by rollup(dept, job);
+ select
+   dept,
+   job,
+   sum(salary)
+ from emp
+ group by
+   rollup(dept, job);
```

```diff
- select dept, job, sum(salary) from emp group by grouping sets ((dept, job), (dept), ());
+ select
+   dept,
+   job,
+   sum(salary)
+ from emp
+ group by
+   grouping sets((dept, job), (dept), ());
```

### LATERAL subquery

```diff
- select b.id, r.avg_price from books b, lateral (select avg(price) as avg_price from books where author_id = b.author_id) r;
+ select
+   b.id,
+   r.avg_price
+ from
+   books as b,
+   lateral (
+     select
+       avg(price) as avg_price
+     from books
+     where author_id = b.author_id
+   ) as r;
```

### Aggregate FILTER and ORDER BY

```diff
- select author_id, count(*) filter (where in_stock = true) as in_stock_count, string_agg(title, ', ' order by title) as titles from books group by author_id;
+ select
+   author_id,
+   count(*) filter (where in_stock = true) as in_stock_count,
+   string_agg(title, ', ' order by title) as titles
+ from books
+ group by
+   author_id;
```

### FOR UPDATE / FOR SHARE

```diff
- select id, title from books where id = 1 for update;
+ select
+   id,
+   title
+ from books
+ where id = 1
+ for update;
```

```diff
- select id from orders for share skip locked;
+ select
+   id
+ from orders
+ for share skip locked;
```

### INSERT — single and multi-row VALUES

```diff
- insert into products (name, price, category) values ('Widget', 9.99, 'tools'), ('Gadget', 19.99, 'electronics');
+ insert into products (name, price, category)
+ values
+   ('Widget', 9.99, 'tools'),
+   ('Gadget', 19.99, 'electronics');
```

### INSERT — ON CONFLICT DO UPDATE

```diff
- insert into users (id, email, updated_at) values (1, 'alice@example.com', now()) on conflict (id) do update set email = excluded.email, updated_at = excluded.updated_at;
+ insert into users (id, email, updated_at)
+ values (1, 'alice@example.com', now())
+ on conflict (id) do update
+ set
+   email = excluded.email,
+   updated_at = excluded.updated_at;
```

### INSERT — RETURNING

```diff
- insert into orders (customer_id, amount) values (42, 150.00) returning id, created_at;
+ insert into orders (customer_id, amount)
+ values (42, 150.00)
+ returning
+   id,
+   created_at;
```

### INSERT — DEFAULT VALUES

```diff
- insert into logs default values returning id, created_at;
+ insert into logs
+ default values
+ returning
+   id,
+   created_at;
```

### UPDATE with RETURNING

```diff
- update users set active = false, updated_at = now() where last_login < now() - interval '1 year' returning id, email;
+ update users
+ set
+   active = false,
+   updated_at = now()
+ where last_login < now() - interval '1 year'
+ returning
+   id,
+   email;
```

### DELETE with RETURNING

```diff
- delete from sessions where expires_at < now() returning id, user_id;
+ delete from sessions
+ where expires_at < now()
+ returning
+   id,
+   user_id;
```

### Data-modifying CTE

```diff
- with moved as (delete from orders where status = 'cancelled' returning id, customer_id, amount) insert into archived_orders (id, customer_id, amount) select id, customer_id, amount from moved;
+ with
+   moved as (
+     delete from orders
+     where status = 'cancelled'
+     returning
+       id,
+       customer_id,
+       amount
+   )
+ insert into archived_orders (id, customer_id, amount)
+ select
+   id,
+   customer_id,
+   amount
+ from moved;
```

### TRUNCATE

```diff
- truncate table sessions, temp_orders restart identity cascade;
+ truncate table sessions, temp_orders restart identity cascade;
```

---

## DDL

### CREATE TABLE with type modifiers

```diff
- create table products (id integer, name varchar(100), price numeric(10,2), tags text[], created_at timestamptz);
+ create table products (
+   id integer,
+   name varchar(100),
+   price numeric(10, 2),
+   tags text[],
+   created_at timestamptz
+ );
```

### CREATE TABLE with PARTITION BY

```diff
- create table orders (id integer not null, region text not null) partition by range (region);
+ create table orders (
+   id integer not null,
+   region text not null
+ )
+ partition by range (region);
```

### CREATE TABLE PARTITION OF

```diff
- create table orders_us partition of orders for values from ('US') to ('ZZ');
+ create table orders_us
+ partition of orders
+ for values from ('US') to ('ZZ');
```

### CREATE TABLE LIKE

```diff
- create table orders_copy (like orders including all);
+ create table orders_copy (
+   like orders including all
+ );
```

### VACUUM / REINDEX

```diff
- vacuum (full, analyze) orders;
+ vacuum (full, analyze) orders;
```

```diff
- reindex (verbose) table orders;
+ reindex (verbose) table orders;
```

### Recursive CTE with SEARCH / CYCLE

```diff
- with recursive t as (select id, parent_id from tree union all select tree.id, tree.parent_id from tree join t on t.id = tree.parent_id) search breadth first by id set ordercol cycle id set is_cycle using path select * from t;
+ with recursive
+   t as (
+     select
+       id,
+       parent_id
+     from tree
+     union all
+     select
+       tree.id,
+       tree.parent_id
+     from
+       tree
+       join t on t.id = tree.parent_id
+   )
+   search breadth first by id set ordercol
+   cycle id set is_cycle using path
+ select
+   *
+ from t;
```

### TABLESAMPLE

```diff
- select id, name from users tablesample bernoulli(10);
+ select
+   id,
+   name
+ from users tablesample bernoulli(10);
```

---

## Expressions

### SUBSTRING

```diff
- select substring(title from 'pg.*'), substring(title from 1 for 5) from books;
+ select
+   substring(title from 'pg.*'),
+   substring(title from 1 for 5)
+ from books;
```

### EXTRACT

```diff
- select extract(year from created_at), extract(month from created_at) from orders;
+ select
+   extract(year from created_at),
+   extract(month from created_at)
+ from orders;
```

### TRIM

```diff
- select trim(leading ' ' from name), trim(trailing ' ' from name), trim(both ' ' from name) from users;
+ select
+   trim(leading ' ' from name),
+   trim(trailing ' ' from name),
+   trim(both ' ' from name)
+ from users;
```

### AT TIME ZONE

```diff
- select created_at at time zone 'UTC', updated_at at time zone 'America/New_York' from events;
+ select
+   created_at at time zone 'UTC',
+   updated_at at time zone 'America/New_York'
+ from events;
```

### INTERVAL literals and :: casts

```diff
- select price::numeric, name::text, interval '30 days', '2024-01-01'::date from t;
+ select
+   price::numeric,
+   name::text,
+   interval '30 days',
+   '2024-01-01'::date
+ from t;
```

### INTERVAL with field modifiers

```diff
- select interval '1' year, interval '1:30' hour to minute from t;
+ select
+   interval '1' year,
+   interval '1:30' hour to minute
+ from t;
```

### Array subscripts

```diff
- select arr[1], arr[2:4], arr[:3] from t;
+ select
+   arr[1],
+   arr[2:4],
+   arr[:3]
+ from t;
```

### Named function arguments

```diff
- select make_date(year => 2024, month => 1, day => 15);
+ select
+   make_date(year => 2024, month => 1, day => 15);
```

### SQL value functions

```diff
- select current_date, current_timestamp, current_user, session_user from t;
+ select
+   current_date,
+   current_timestamp,
+   current_user,
+   session_user
+ from t;
```

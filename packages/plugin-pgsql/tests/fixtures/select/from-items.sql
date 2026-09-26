-- Functions in FROM, with and without aliases, column lists and definition lists
select * from generate_series(1, 3);
select n from generate_series(1, 3) as g(n);
select * from unnest(array[1, 2]) with ordinality as u(v, i);
select * from json_to_record('{"a": 1}') as r(a int, b text);
select * from rows from (generate_series(1, 2), unnest(array['a', 'b'])) with ordinality as z(x, y, o);
select * from orders as o, lateral generate_series(1, o.quantity) as g(i);

-- Alias column lists rename the relation's columns: dropping them breaks references
select a from orders as x(a, b);
select * from (select 1, 2) as s(x, y);

-- VALUES lists as FROM items
select * from (values (1, 'a'), (2, 'b')) as v(id, name);
insert into archive select * from (values (1)) as v(x);

-- CTE column lists
with totals(customer_id, total) as (select customer_id, sum(amount) from orders group by customer_id) select * from totals;
with recursive r(n) as (select 1 union all select n + 1 from r where n < 3) select * from r;

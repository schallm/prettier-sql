select author_id, count(*) filter (where in_stock = 1) as in_stock_count, count(*) filter (where in_stock = 0) as out_of_stock_count from books group by author_id;

select author_id, string_agg(title, ', ' order by title) as titles from books group by author_id;

-- FILTER with OVER (window aggregate)
select dept, sum(salary) filter (where active = true) over (partition by dept) as active_payroll from employees;

-- Multiple aggregates with FILTER in one query
select
  count(*) filter (where status = 'open') as open_count,
  count(*) filter (where status = 'closed') as closed_count,
  sum(amount) filter (where status = 'open') as open_total
from tickets;

-- ORDER BY inside aggregate without FILTER
select dept, array_agg(name order by name) as members from employees group by dept;

-- DISTINCT inside aggregate
select count(distinct customer_id) as unique_customers, sum(amount) as total from orders;

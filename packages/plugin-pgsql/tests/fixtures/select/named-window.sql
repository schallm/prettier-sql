-- Named WINDOW clause
select
  id,
  author_id,
  price,
  sum(price) over w as running_total,
  row_number() over w as rn
from
  books
window
  w as (partition by author_id order by price);

-- Multiple named windows and mixed inline
select
  id,
  dept,
  salary,
  row_number() over w1 as dept_rank,
  sum(salary) over w2 as dept_total,
  avg(salary) over (partition by dept) as dept_avg
from
  employees
window
  w1 as (partition by dept order by salary desc),
  w2 as (partition by dept);

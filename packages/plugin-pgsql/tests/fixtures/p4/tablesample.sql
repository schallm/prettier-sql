select id, title
from books tablesample bernoulli(10);

select count(*)
from orders tablesample system(5) repeatable (42);

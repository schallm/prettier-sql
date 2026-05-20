-- Basic multi-CTE
with active_users as (select id, name from users where active = true), recent_orders as (select customer_id, sum(amount) as total from orders where created_at > now() - interval '30 days' group by customer_id) select u.name, ro.total from active_users as u join recent_orders as ro on u.id = ro.customer_id;

-- WITH RECURSIVE
with recursive org_tree as (select id, name, parent_id, 0 as depth from departments where parent_id is null union all select d.id, d.name, d.parent_id, t.depth + 1 from departments as d join org_tree as t on d.parent_id = t.id) select id, name, depth from org_tree order by depth, name;

-- CTE with DISTINCT and set op
with top_authors as (select author_id, count(*) as book_count from books group by author_id having count(*) > 5) select a.name, t.book_count from authors as a join top_authors as t on a.id = t.author_id order by t.book_count desc;

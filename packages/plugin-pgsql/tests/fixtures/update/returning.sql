update users set active = false where last_login < now() - interval '1 year' returning id, email;

-- UPDATE with FROM
update order_items set price = p.price from products as p where order_items.product_id = p.id;

-- UPDATE with FROM and RETURNING
update employees set salary = salary * 1.1 from departments as d where employees.dept_id = d.id and d.name = 'Engineering' returning employees.id, employees.salary;

-- UPDATE with subquery in SET
update users set status = (select status from status_map where code = users.status_code) where status_code is not null;

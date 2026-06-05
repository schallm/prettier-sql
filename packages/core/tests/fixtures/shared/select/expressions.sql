select cast(price as integer) from books;

select cast(title as varchar(100)) from books;

select coalesce(deleted_at, current_timestamp) from books;

select nullif(price, 0) from books;

select id, price * 1.1 as adjusted, price - 5.0 as discounted, price + 3.0 as surcharge from books;

select current_timestamp, current_user from books;

-- Long arithmetic chain: continuation lines indent one level under the expression start
select id, price + shipping_cost + tax_amount + handling_fee + insurance_cost + discount_amount as total_cost from orders where status = 1;

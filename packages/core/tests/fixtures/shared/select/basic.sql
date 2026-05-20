select id, title, price from books where in_stock = 1 order by price asc;

select id, title, price from books where in_stock = 1 and price < 50 order by price desc;

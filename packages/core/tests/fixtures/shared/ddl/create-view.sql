create view available_books as
select id, title, price from books where in_stock = 1;

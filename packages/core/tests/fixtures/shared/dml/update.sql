update books set price = price * 0.9, in_stock = 1 where author_id = 1 and price > 20;

update books set in_stock = 0 from publishers where books.publisher_id = publishers.id and publishers.country = 'UK';

update books set price = (select avg(price) from books where author_id = 1) where author_id = 1;

select id, title from books where id in (1, 2, 3);
select id, title from books where id not in (1, 2, 3);
select id, title, price from books where price between 10 and 50;
select id, title, price from books where price not between 10 and 50;
select id, title from books where deleted_at is null;
select id, title from books where deleted_at is not null;
select id, title from books where title like 'The%';
select id, title from books where title not like '%old%';
select id, title from books where title like '%sql%' and price between 20 and 100 and deleted_at is null;

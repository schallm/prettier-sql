select id, title from books where id in (1, 2, 3);

select id, title from books where id not in (1, 2, 3);

select id, title, price from books where price between 10 and 50;

select id, title, price from books where price not between 10 and 50;

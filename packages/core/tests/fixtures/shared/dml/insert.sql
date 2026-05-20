insert into books (title, author_id, price, in_stock) values ('The Pragmatic Programmer', 1, 39.99, 1);

insert into books (title, author_id, price, in_stock) values ('Clean Code', 1, 39.99, 1), ('The Pragmatic Programmer', 2, 49.99, 1), ('Design Patterns', 3, 44.99, 0);

insert into archived_books (id, title, price) select id, title, price from books where in_stock = 0;

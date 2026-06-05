insert into books (title, author_id, price, in_stock) values ('The Pragmatic Programmer', 1, 39.99, 1);

insert into books (title, author_id, price, in_stock) values ('Clean Code', 1, 39.99, 1), ('The Pragmatic Programmer', 2, 49.99, 1), ('Design Patterns', 3, 44.99, 0);

-- Single-column rows: fill-pack at printWidth in standard density
insert into genre_ids (id) values (1), (2), (3), (4), (5), (6), (7), (8), (9), (10), (11), (12);

insert into archived_books (id, title, price) select id, title, price from books where in_stock = 0;

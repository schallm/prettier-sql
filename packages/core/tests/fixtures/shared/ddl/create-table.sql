create table authors (id integer not null, first_name varchar(100) not null, last_name varchar(100) not null, country varchar(100), constraint pk_authors primary key (id));

create table books (id integer not null, title varchar(200) not null, author_id integer not null, price decimal(10, 2) not null, in_stock integer not null default 1, constraint pk_books primary key (id), constraint fk_books_author foreign key (author_id) references authors (id), constraint chk_books_price check (price >= 0));

create table order_items (order_id integer not null, book_id integer not null, quantity integer not null default 1, unit_price decimal(10, 2) not null, constraint pk_order_items primary key (order_id, book_id), constraint fk_order_items_order foreign key (order_id) references orders (id), constraint fk_order_items_book foreign key (book_id) references books (id));

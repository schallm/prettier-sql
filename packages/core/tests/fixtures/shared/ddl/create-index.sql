create index ix_books_author_id on books (author_id);

create unique index ux_books_title on books (title);

create index ix_books_price_desc on books (price desc);

create index ix_books_genre_price on books (genre_id, price desc);

create index ix_books_in_stock on books (author_id) where in_stock = 1;

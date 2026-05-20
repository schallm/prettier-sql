alter table books add summary varchar(500);

alter table books add is_featured integer not null default 0;

alter table books drop column summary;

alter table books add constraint uq_books_title unique (title);

alter table books add constraint fk_books_publisher foreign key (publisher_id) references publishers (id);

alter table books add constraint chk_books_stock check (in_stock >= 0);

alter table books drop constraint uq_books_title;

alter table books drop constraint fk_books_publisher;

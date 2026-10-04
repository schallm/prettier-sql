-- CAST: PostgreSQL prints it as ::, T-SQL keeps CAST
select cast(price as integer) from books;

select cast(title as varchar(100)) from books;

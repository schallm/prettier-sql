-- Single-column rows: fill-pack at printWidth in standard density
insert into @moviesToAdd (Id)
values (310000267), (310000488), (310000577), (310000552), (310000399), (310000576), (310001689), (310000376), (310000623), (310000017)

-- Multi-column rows: one per line in standard density
insert into Books (Title, AuthorId, Price)
values ('The Great Gatsby', 1, 9.99), ('To Kill a Mockingbird', 2, 12.99), ('Of Mice and Men', 3, 7.99), ('The Catcher in the Rye', 4, 11.99)

-- Single row: always inline regardless of density
insert into Books (Title, AuthorId, Price)
values ('Clean Code', 1, 39.99)

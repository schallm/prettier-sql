create index IX_Books_Title on Books (Title asc)

create unique index UX_Books_Isbn on Books (Isbn asc)

create clustered index CX_Orders_Date on Orders (OrderDate desc)

create nonclustered index IX_Books_Genre_Price on Books (GenreId asc, Price desc) include (Title, InStock)

create unique nonclustered index UX_Authors_Email on Authors (Email asc) where Email is not null

alter index IX_Books_Title on Books rebuild

alter index IX_Books_Genre_Price on Books reorganize

alter index all on Books disable

drop index IX_Books_Title on Books

drop index if exists IX_Books_Title on Books

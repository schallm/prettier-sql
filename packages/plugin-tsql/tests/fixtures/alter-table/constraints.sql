alter table Books
add constraint UQ_Books_Isbn unique (Isbn)

alter table Orders
add constraint FK_Orders_Customers
  foreign key (CustomerId) references Customers (Id)
  on delete cascade
  on update no action

alter table Books
add constraint CK_Books_Price check (Price > 0)

alter table Books
drop constraint UQ_Books_Isbn

alter table Books
drop constraint if exists CK_Books_Price

alter table Orders
with check add constraint FK_Orders_Customers
  foreign key (CustomerId) references Customers (Id)

alter table Orders nocheck constraint FK_Orders_Customers

alter table Orders check constraint all

create index IX_Books_InStock on Books (Price asc)
where InStock = 1;

create unique index UQ_Orders_Active on Orders (CustomerId asc)
where
  Status <> 'Cancelled'
  and Total > 0;

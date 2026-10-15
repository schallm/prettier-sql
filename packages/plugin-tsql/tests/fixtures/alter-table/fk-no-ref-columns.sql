-- REFERENCES with no explicit column list must not print an empty () (bug: unparseable)
alter table t with nocheck add constraint fk foreign key (a) references u

-- FOREIGN KEY with no column list of its own
alter table Loans with check add constraint FK_Loans_Books foreign key references dbo.Books (BookId) on delete cascade;

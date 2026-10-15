-- RESTART without a value, and CACHE without a size
alter sequence dbo.s restart

alter sequence dbo.s restart with 5

alter sequence dbo.s cache

alter sequence dbo.s no cache

-- A user-defined type keeps its case
create sequence MySeq as dbo.MyInt;

-- Options in any order: printed in one fixed order
create sequence dbo.InvoiceNo maxvalue 9999 cache 20 minvalue 1 as int;
alter sequence dbo.InvoiceNo minvalue 1 restart with 100 maxvalue 9999 no cache;

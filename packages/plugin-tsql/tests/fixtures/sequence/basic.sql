create sequence OrderSeq as int start with 1 increment by 1

create sequence dbo.InvoiceSeq
    as bigint
    start with 1000
    increment by 1
    minvalue 1000
    maxvalue 9999999
    no cycle
    cache 50

alter sequence OrderSeq restart with 1

alter sequence dbo.InvoiceSeq increment by 10 maxvalue 99999999 cycle cache 100

drop sequence OrderSeq

drop sequence if exists OrderSeq

drop sequence dbo.InvoiceSeq, dbo.OrderSeq

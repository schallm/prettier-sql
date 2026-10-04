create table dbo.t (very_long_column_name_one int not null constraint pk_very_long_name primary key clustered, b varchar(10) default 'abc', c int not null);
create table dbo.t2 (OrderId int not null constraint FK_LineItems_Order references dbo.Orders (OrderId) on delete cascade, ProductId int not null constraint FK_LineItems_Product references dbo.Products (ProductId));
create table dbo.t3 (ssn char(9) collate Latin1_General_BIN2 encrypted with (column_encryption_key = CEK1, encryption_type = deterministic, algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_256'));

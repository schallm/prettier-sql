-- OPENROWSET(BULK ...) keeps every file, option value, ORDER ... UNIQUE and alias column
select * from openrowset(bulk 'books.dat', single_clob, lastrow = 10) as b (Doc);
select * from openrowset(bulk 'books.dat', single_nclob, order (BookId asc, Year desc) unique) as b;
select * from openrowset(bulk 'books.csv', format = 'CSV', parser_version = '2.0', header_row = true) as b;
select top 10 * from openrowset(bulk ('https://example.com/a/*.parquet', 'https://example.com/b/*.parquet'), format = 'PARQUET') as b;
select * from openrowset(bulk 'f1', format = 'CSV', parser_version = '1.0', header_row = true, rowset_options = '{"READ_OPTIONS": ["ALLOW_INCONSISTENT_READS"]}') with (Region varchar(100)) as b;

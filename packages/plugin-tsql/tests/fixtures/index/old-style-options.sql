-- SQL Server 2000 index options, without parentheses: naming an option turns it on
create index IX_Books_Title on Books (Title) with pad_index, fillfactor = 70;
create unique index UQ_Books_Isbn on Books (Isbn) with ignore_dup_key, drop_existing, statistics_norecompute, sort_in_tempdb;

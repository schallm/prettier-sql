-- Spellings the database treats as the same: the formatter may print either
alter database scoped configuration clear procedure_cache 0x06000600D5629633A06F79AC33020000;

create table dbo.LoanHistory (
    LoanId int not null,
    ValidFrom datetime2 generated always as row start not null,
    ValidTo datetime2 generated always as row end not null,
    period for system_time (ValidFrom, ValidTo)
) on 'default' textimage_on "default"
with (system_versioning = on (history_retention_period = 6 month));

create index IX_LoanHistory_LoanId on dbo.LoanHistory (LoanId) on 'default';

select Title from Books where Title like 'x!%%' {escape '!'};

declare @recent as table (BookId int);

dbcc tracestatus ();

select {fn current_time} as Now;

alter schema Archive transfer object::dbo.OldLoans;

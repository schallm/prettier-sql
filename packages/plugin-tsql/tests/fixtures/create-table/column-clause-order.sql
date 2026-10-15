-- Column clauses keep the order T-SQL's grammar takes them in
create table Loans (
    LoanId int hidden identity(1, 1) not for replication,
    RowId uniqueidentifier hidden rowguidcol not null default newid(),
    Notes nvarchar(200) masked with (function = 'partial(1, "xx", 0)') hidden null,
    Extra int sparse identity,
    Document varbinary(max) filestream rowguidcol,
    Props xml column_set for all_sparse_columns hidden,
    ValidFrom datetime2 generated always as row start masked with (function = 'default()') hidden not null,
    ValidTo datetime2 generated always as row end hidden not null,
    period for system_time (ValidFrom, ValidTo)
);

alter table Loans alter column Notes nvarchar(400) masked with (function = 'default()') hidden not null;

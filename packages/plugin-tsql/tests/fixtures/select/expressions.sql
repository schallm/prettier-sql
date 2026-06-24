select current_timestamp, current_user, session_user, system_user

select $partition.PF_OrderDate(OrderDate)
from Orders

insert into Books (Title, Price, InStock) values ('Clean Code', 39.99, default)

select identity(int, 1, 1) as Id, Name
into #Temp
from Source

select next value for dbo.OrderSeq

select next value for dbo.OrderSeq over (order by Id)

select parse('2023-01-01' as date)

select parse('3.14' as decimal(10, 2) using 'en-US')

select try_parse('abc' as int)

select try_parse('2023-01-01' as date using 'en-US')

select string_agg(Name, ', ') within group (order by Name)
from Authors

select percentile_cont(0.5) within group (order by Salary)
over (partition by Department)
from Employees

select top (10) with ties Id, Title, Price
from Books
order by Price desc

select top (10) percent Id, Title
from Books
order by Price desc

select 1 where a is distinct from b

select 1 where a is not distinct from b

-- N-prefix (unicode) string literals must be preserved
select N'unicode string', 'regular string', N'unicode' + 'concat'
from t
where col = N'filter value'

-- Binary literals (0x prefix must not be doubled)
select 0x1A2B3C, 0xDEADBEEF
from t

-- Escaped single quotes in string literals
select 'it''s a test', N'it''s unicode'
from t

-- COLLATE clause on column references
select Name collate Latin1_General_CI_AS, Code collate SQL_Latin1_General_CP1_CS_AS
from Products
where Name collate SQL_Latin1_General_CP1_CI_AS = N'test'

-- LEFT/RIGHT are special ScriptDom subtypes — must normalize case like any function
select LEFT(Email, 10), RIGHT(Name, 5), LEFT(a, 1) + RIGHT(b, 2)
from Users

-- CURRENT_DATE — SQL Server 2025 parameterless function (like CURRENT_TIMESTAMP)
select current_date

-- UNISTR — SQL Server 2025
select unistr('\0041\0042\0043')

-- PRODUCT aggregate — SQL Server 2025
select product(Quantity)
from OrderItems

-- BASE64_ENCODE / BASE64_DECODE — SQL Server 2025
select base64_encode(FileContent) as encoded, base64_decode(EncodedCol) as decoded
from Documents

-- EDIT_DISTANCE / fuzzy string matching — SQL Server 2025
select edit_distance('kitten', 'sitting') as dist, edit_distance_similarity('kitten', 'sitting') as sim

-- || pipe concatenation operator — SQL Server 2025
select 'foo' || 'bar'

select FirstName || ' ' || LastName as FullName
from Employees

select a || b || c || d
from t

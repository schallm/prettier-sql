-- Statements kept as their source text: comments around them print once, and a
-- line comment at the end doesn't take the semicolon
select 'é, 日本語';
-- before
alter role r set x = 1; /* after */
alter default privileges grant select on tables to u -- last

-- Pseudo-columns keep their qualifier and spelling
select identitycol, rowguidcol, b.identitycol, dbo.Books.rowguidcol, Library..Books.Identitycol, b.$identity, $rowguid from dbo.Books as b;

-- A full-text predicate's wildcard keeps its table
select Title from dbo.Books as b where contains((b.$identity), 'x') and freetext(b.*, N'whale') and freetext(*, 'sea');

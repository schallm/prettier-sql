-- ODBC escapes: {fn ...} functions only exist inside the escape
select {d '2020-01-01'}, {ts '2020-01-01 00:00:00'}, {fn UCASE('a')}, {fn CURDATE()}, {fn CONCAT('a', 'b')};

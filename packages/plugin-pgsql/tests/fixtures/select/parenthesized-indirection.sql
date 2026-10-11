-- Each pair of parentheses applies one indirection: (a[1])[2] subscripts a 2-D array once
-- (NULL), a[1][2] takes an element.
select (a[1])[2], (a[1:2])[1], (a.b[1]).c, ((t.c).f).g, ((t.c).f).* from t;

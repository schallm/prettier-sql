-- Multi-word type spellings print as the type they are
create table Spellings (
    a char varying(10), b character varying(20), c national char varying(10), d nchar varying(5),
    e national character(3), f national char, g binary varying(4), h national text, i double precision,
    -- One-word spellings stay as written
    j integer, k dec(5, 2)
);
declare @v national char varying(20), @w char varying(8);

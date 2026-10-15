-- A control character other than a newline or tab stays escaped: written raw, a carriage
-- return would become a newline when line endings are normalized
select E'abc\r\ndef' as crlf, E'mac\rline' as cr, E'tab\there' as tab, E'form\ffeed\b' as ff;
select E'back\\slash\r' as mixed, E'it''s\r' as quote, E'\x01\x7f' as hex;
insert into copytest values ('DOS', E'abc\r\ndef', 1);

-- No other control character: a plain string, newline and all
select E'line one\nline two' as nl, 'it''s' as plain;
comment on table copytest is E'note\r';

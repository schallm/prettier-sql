select a << 1, b >> 2, a & b | c ^ d from t;
select a as 'two words', b as "other name", c as 'plain', d as 'it''s' from t;
select all a from t;
select count(all a), sum(distinct a) from t;

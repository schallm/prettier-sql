select a.id from t a inner join u on a.very_long_column_name_one = u.very_long_column_name_one and a.very_long_column_name_two = u.very_long_column_name_two;
select a.id from t a where a.very_long_column_name_one like '%some long pattern here that is long enough to need wrapping%' escape '\';
select a.id from t a where a.very_long_column_name_one not like '%some long pattern here that is long enough to need wrapping%';
select a.id from t a where a.very_long_column_name_one is distinct from a.very_long_column_name_two_with_a_longer_name_still;
select a.id from t a where a.very_long_column_name_one = (select max(u.very_long_column_name_one) from u where u.id = a.id);
select a.id from t a where a.very_long_column_name_one + a.very_long_column_name_two - a.very_long_column_name_three > 1000000;
select a.id from t a where a.very_long_column_name_one = 'a long string literal value that does not fit on the line at all';
select a.id from t a where a.x = 1;

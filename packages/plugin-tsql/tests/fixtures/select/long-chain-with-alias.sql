select a.id, a.very_long_column_name_one + a.very_long_column_name_two as c from t a;
select substring(a.very_long_column_name_one, 1, 10) + ltrim(a.very_long_column_name_two) + charindex('x', a.three) as c from t a;
select a.base_amount + a.shipping_amount * a.tax_rate - a.discount_amount + a.handling_fee + a.insurance_fee as total from t a;
select a + b as s, a.very_long_column_name_one + a.very_long_column_name_two + a.very_long_column_name_three as alias_name_that_is_long from t a;
select a.x + a.y from t a;
select a.very_long_column_name_one + a.very_long_column_name_two + a.very_long_column_name_three as alias_one, -- first
  a.x + a.very_long_column_name_two + a.very_long_column_name_three + a.very_long_column_name_four as alias_two from t a;

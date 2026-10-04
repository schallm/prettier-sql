declare @very_long_variable_name nvarchar(100) = N'a very long string literal that goes past the print width of eighty characters';
set @very_long_variable_name = @another_very_long_variable_name + @yet_another_very_long_variable_name + @last_one;
declare @a int = 1, @total int = @very_long_variable_name_one + @very_long_variable_name_two + @very_long_variable_name_three;
set @x = 1;
set @x += @very_long_variable_name_one * @very_long_variable_name_two + @very_long_variable_name_three - 1;
set @s = (select max(id) from t);

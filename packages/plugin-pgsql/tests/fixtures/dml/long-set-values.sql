set search_path to some_long_schema_name, another_long_schema_name, third_long_schema_name, public;
set search_path to public;
set local statement_timeout to '5min';
set session some_extension.some_long_setting_name = 'a very long string value for the setting that does not fit';

-- Options with values must keep them
create user u with password = 'x'

create user u with password = N'x', default_schema = dbo

create user u from external provider

create user u for login l with default_schema = dbo

alter user u with password = 'x' old_password = 'y'

alter user u with name = v, default_schema = s, login = l

create login l from external provider

create login l with password = 'x' must_change, default_database = d, check_policy = off, sid = 0x01

create login l from windows with default_database = d, default_language = french

alter login l with name = m, check_expiration = on, credential = c

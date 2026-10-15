create user AppUser for login AppLogin

create user ReportUser without login with default_schema = dbo

alter user AppUser with name = NewAppUser, default_schema = sales

drop user AppUser

drop user if exists AppUser

create login AppLogin with password = 'Str0ngP@ssw0rd!'

create login DomainUser from windows with default_database = AdventureWorks

alter login AppLogin with password = 'NewP@ssw0rd!' old_password = 'Str0ngP@ssw0rd!'

alter login AppLogin enable

drop login AppLogin

create role db_reader authorization dbo

alter role db_reader add member AppUser

alter role db_reader drop member AppUser

drop role db_reader

grant select on dbo.Books to AppUser

grant select, insert, update on dbo.Books to AppUser, ReportUser

grant select on dbo.Books (Title, Price) to ReportUser

grant execute on dbo.GetAvailableBooks to AppUser with grant option

deny delete on dbo.Books to AppUser

revoke select on dbo.Books from AppUser

revoke select on dbo.Books from AppUser cascade

grant select, insert, update, delete on schema::dbo to AppUser

grant control on database::AdventureWorks to AppUser

-- Two-word securable classes
grant control on application role::r to u;

grant execute on external model::m to u;

-- NULL as a principal
grant select on dbo.Books to public, null, [ReportUser], Auditor;
deny update on dbo.Books to null cascade;
revoke grant option for select on dbo.Books from null, public cascade;

-- ON SERVER, with or without a name
grant view server state on server to Auditor;
revoke create on server::Srv1 from null cascade;

create user AppUser for login AppLogin with default_schema = dbo

create user ReportUser without login with default_schema = reporting

create user ExternalUser from external provider

alter user AppUser with name = NewAppUser

alter user AppUser with default_schema = sales

create role ReadOnly

create role DataReader authorization dbo

alter role ReadOnly add member AppUser

alter role ReadOnly drop member AppUser

alter role ReadOnly with Name = db_readonly

drop role ReadOnly

drop role if exists db_readonly

grant select, insert, update on schema::dbo to AppUser

grant control on database::AdventureWorks to AppUser

grant impersonate on login::ServiceLogin to AppUser

deny delete on object::dbo.AuditLog to AppUser

revoke select on schema::dbo from AppUser cascade

grant select on dbo.Books (Title, Price) to ReportUser

grant execute on dbo.GetAvailableBooks to AppUser with grant option

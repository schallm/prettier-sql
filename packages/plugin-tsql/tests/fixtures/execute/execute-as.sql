execute as caller;

execute as user = 'dbo';

execute as login = 'sa';

execute as caller with no revert;

revert;
go
create procedure dbo.GetBooks with encryption as begin select BookId from Books; end
go
create procedure dbo.RefreshCache with recompile as begin select 1; end
go
create procedure dbo.SecureProc with execute as owner as begin select BookId from Books; end

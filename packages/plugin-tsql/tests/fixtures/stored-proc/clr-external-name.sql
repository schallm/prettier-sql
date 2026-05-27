create procedure dbo.SendEmail @to nvarchar(200), @subject nvarchar(200), @body nvarchar(max) as external name MyClrLib.[MyNamespace.Mailer].Send
go
create procedure dbo.LogEvent @message nvarchar(max) with execute as owner as external name MyClrLib.[MyNamespace.Logger].Log

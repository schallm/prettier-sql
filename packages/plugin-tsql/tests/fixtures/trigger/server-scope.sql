-- ON ALL SERVER scope and the LOGON event were being dropped
create trigger tr on all server with execute as caller for logon as
begin
    print 'x'
end

-- Comments that describe a parameter stay with it
create procedure dbo.usp_Process
    @BatchDate date = null, -- defaults to today
    @MaxRows int = 1000,    -- safety cap
    -- debugging output
    @Debug bit = 0
as
select 1;
go

create function dbo.f(
  @a int, -- first
  @b int /* second */
) returns int as begin return @a + @b; end

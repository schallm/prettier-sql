-- EXECUTE: context, linked server with pass-through parameters, numbered procedures, WITH options
EXEC ('select 1') AS USER = 'u';

EXEC ('select 1') AS LOGIN = 'l';


EXEC ('select ?, ?', 1, @x) AT [my server];

EXEC [my server].db.dbo.p;

EXEC dbo.p;2 1;

EXEC dbo.p @a = 1 WITH RECOMPILE;

EXEC dbo.p WITH RESULT SETS ((a int, b varchar(10)));

EXEC dbo.p WITH RESULT SETS NONE;

EXEC @rc = @procname @x = 1;

EXEC sp_executesql @stmt = N'select @a', @params = N'@a int', @a = 1;

EXEC dbo.p 'WITH RESULT SETS';

EXEC dbo.p WITH RESULT SETS ((a int NOT NULL, b varchar(10)), AS OBJECT dbo.t, AS TYPE dbo.tt, AS FOR XML);

EXEC dbo.p WITH RECOMPILE, RESULT SETS UNDEFINED;

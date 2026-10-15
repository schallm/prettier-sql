-- GLOBAL cursor references, and the ISO DECLARE ... INSENSITIVE SCROLL CURSOR form
DECLARE c INSENSITIVE SCROLL CURSOR FOR SELECT a FROM t FOR READ ONLY;

DECLARE c INSENSITIVE CURSOR FOR SELECT a FROM t;

DECLARE c CURSOR GLOBAL SCROLL DYNAMIC FOR SELECT a FROM t FOR UPDATE OF a;

FETCH RELATIVE -2 FROM GLOBAL c INTO @a, @b;

FETCH NEXT FROM @cv;

OPEN GLOBAL c; CLOSE GLOBAL c; DEALLOCATE GLOBAL c;

OPEN c; CLOSE @cv; DEALLOCATE c;

-- A cursor's query keeps its CTEs and query hints
declare Recent cursor fast_forward for with New as (select BookId from dbo.Books where Year > 2000) select BookId from New option (maxdop 1);
set @c = cursor for with Old as (select BookId from dbo.Books where Year < 1900) select BookId from Old;

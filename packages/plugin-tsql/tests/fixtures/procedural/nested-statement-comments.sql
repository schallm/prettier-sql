-- A trailing comment on a statement inside a block is printed once
IF 1 = 1
BEGIN
  PRINT 'a'; -- after print
END;

WHILE 1 = 1
BEGIN
  BREAK; -- stop
END;

BEGIN TRY
  SELECT 1; -- inside try
END TRY
BEGIN CATCH
  THROW; -- rethrow
END CATCH;

IF @a = 1
BEGIN
  SET @b = 1; SET @c = 2; -- both set
  IF @b = 1
  BEGIN
    PRINT 'x'; -- inner
  END
  PRINT 'y';
END
ELSE
  PRINT 'z'; -- else branch

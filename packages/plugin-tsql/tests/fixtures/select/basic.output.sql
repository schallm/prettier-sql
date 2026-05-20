SELECT
    Books.Id,
    Books.Title,
    Authors.FirstName
FROM
    Books
    INNER JOIN Authors ON Books.AuthorId = Authors.Id
WHERE
    Books.InStock = 1
ORDER BY
    Books.Title ASC;

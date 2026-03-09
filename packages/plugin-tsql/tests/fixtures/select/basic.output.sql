SELECT
    u.id,
    u.Name,
    u.Email
FROM
    users AS u
    INNER JOIN roles AS r ON u.RoleId = r.id
WHERE
    u.Active = 1
ORDER BY
    u.Name ASC;

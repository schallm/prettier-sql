SELECT
    u.id,
    u.name,
    u.email
FROM
    dbo.users AS u
    INNER JOIN dbo.roles AS r ON u.role_id = r.id
WHERE
    u.active = 1
ORDER BY
    u.name ASC;

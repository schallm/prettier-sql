update users set active = false where last_login < now() - interval '1 year' returning id, email;

delete from sessions where expires_at < now() returning id, user_id;

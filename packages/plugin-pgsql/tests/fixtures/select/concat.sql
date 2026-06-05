-- Long || chain: continuation lines indent one level under the expression start
select author_id, first_name || ' ' || last_name || ' (' || email || ')' || ' — ' || city || ', ' || country as contact_info from authors where is_active = true;

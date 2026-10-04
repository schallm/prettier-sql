-- A statement kept as written must stop before END CONVERSATION, not swallow its keywords
create database d with ledger = on;
end conversation @h;

backup database d to disk = 'x' with encryption (algorithm = aes_256, server certificate = c);
end conversation @h with cleanup;

create database e collate latin1_general_100_ci_as_sc with catalog_collation = sql_latin1_general_cp1_ci_as;
end conversation @h with error = 50001 description = 'failed';

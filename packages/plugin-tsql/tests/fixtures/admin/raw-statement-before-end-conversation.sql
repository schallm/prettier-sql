-- A statement kept as written must stop before END CONVERSATION, not swallow its keywords
create external language l from (content = 'x', file_name = 'y', platform = windows);
end conversation @h;

create external language m from (content = 'a', file_name = 'b', platform = linux);
end conversation @h with cleanup;

create external library lib from (content = 0x01) with (language = 'R');
end conversation @h with error = 50001 description = 'failed';

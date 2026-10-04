waitfor (receive top (1) conversation_handle, message_body from dbo.q where conversation_group_id = @g), timeout 1000;
waitfor (receive * from dbo.q);
waitfor (receive top (10) conversation_handle, message_type_name, cast(message_body as xml) as body from dbo.SomeLongQueueName into @t where conversation_handle = @h), timeout 5000;
waitfor (get conversation group @g from dbo.q), timeout 100;
receive top (1) conversation_handle, message_body from dbo.q;
receive conversation_handle as h, service_name from q into @tbl where conversation_handle = @handle;

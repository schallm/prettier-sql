-- WAITFOR: a delay, a time, or a Service Broker statement with a timeout
waitfor delay '00:00:01';
waitfor time @at;
waitfor (receive top (1) conversation_handle, message_body from dbo.q where conversation_group_id = @g), timeout 1000;
waitfor (get conversation group @g from dbo.q);

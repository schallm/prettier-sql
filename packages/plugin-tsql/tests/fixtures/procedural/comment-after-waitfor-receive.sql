waitfor (
  receive top (1) conversation_handle, message_body
  from dbo.q
  where conversation_group_id = @g /* after the receive */
), timeout 1000;
select 1;

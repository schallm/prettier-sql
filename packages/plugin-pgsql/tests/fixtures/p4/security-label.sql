security label for my_provider on table orders is 'sensitive';

security label for my_provider on column orders.amount is 'pii';

-- an embedded quote in the label must round-trip escaped, or it doesn't parse
security label for my_provider on table orders is 'it''s sensitive';

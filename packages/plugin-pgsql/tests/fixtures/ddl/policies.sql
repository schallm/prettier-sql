create policy view_own_data on users for select using (user_id = current_user_id());

alter policy view_own_data on users using (user_id = current_user_id());

-- WITH CHECK (for INSERT/UPDATE)
create policy insert_own_rows on orders for insert with check (customer_id = current_user_id());

-- USING and WITH CHECK together
create policy manage_own_orders on orders for all using (customer_id = current_user_id()) with check (customer_id = current_user_id());

-- FOR UPDATE
create policy update_own_profile on users for update using (id = current_user_id()) with check (id = current_user_id());

-- FOR DELETE
create policy delete_own_sessions on sessions for delete using (user_id = current_user_id());

-- Permissive vs restrictive
create policy admin_all on orders as permissive for all to admin_role using (true);

create policy restrict_sensitive on users as restrictive using (not is_internal);

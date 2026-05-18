create policy view_own_data on users for select using (user_id = current_user_id());

alter policy view_own_data on users using (user_id = current_user_id());

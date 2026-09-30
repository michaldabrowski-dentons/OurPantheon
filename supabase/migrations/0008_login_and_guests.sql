-- 0008: accounts are login + password (a synthetic e-mail address on panteon.invalid, never mailed)
-- and guests come in through Supabase anonymous sign-ins, which create auth users without any e-mail.
-- The profile trigger must therefore tolerate a missing address: a guest starts with an empty name
-- and is asked for one right after entering; a registered player gets the login as their name.
--
-- Project settings this needs (Supabase dashboard, Authentication -> Sign In / Providers):
--   Email: "Confirm email" OFF (no mail is ever sent)
--   "Allow anonymous sign-ins" ON

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

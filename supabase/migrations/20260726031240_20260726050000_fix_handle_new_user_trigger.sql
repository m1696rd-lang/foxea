/*
# Fix handle_new_user trigger: stop linking both investors to the admin user

## Root cause
The live `public.handle_new_user()` trigger links BOTH the "Mauricio" and "Alfredo"
investor rows to the new admin user (m1696rd@gmail.com). But `public.investors` has a
`UNIQUE(fund_id, user_id)` constraint, so assigning the same user_id to two investors in
the same fund raises a unique-violation and aborts the entire `INSERT INTO auth.users`.
The result: the admin user can never be created, auth.users stays empty, and the app
cannot load past the sign-in screen.

## Fix
Link only the "Mauricio" investor (the admin's own investor position) to the admin user.
"Alfredo" remains unlinked (user_id NULL) so a separate account can be created for it
later without violating the unique constraint.

## No data changes
This migration only redefines the trigger function. It does not insert, update, or
delete any rows in any financial table. Existing investors, contributions, withdrawals,
cycles, snapshots, and audit records are untouched.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'username'),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  IF NEW.email = 'm1696rd@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'investor') ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET username = 'MauRD16', full_name = 'Mauricio' WHERE id = NEW.id;
    -- Genesis owns the Mauricio investor position only. Alfredo stays unlinked so a
    -- separate account can be created for it later (UNIQUE(fund_id, user_id) constraint).
    UPDATE public.investors SET user_id = NEW.id
      WHERE display_name = 'Mauricio' AND user_id IS NULL;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'investor') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
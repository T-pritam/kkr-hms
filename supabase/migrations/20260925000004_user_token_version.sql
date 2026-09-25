-- Sessions end when a password changes (BUGS.md #3)
--
-- A session is a 10-minute access token renewed from a 7-day refresh token, and
-- nothing tied either to the password: after a change — even a forgotten-
-- password reset — every token already issued kept working for its full life,
-- so someone holding a stolen session kept it.
--
-- Each token now carries the user's `token_version`, and every renewal (at most
-- ten minutes apart) re-reads it along with the account's status. Changing or
-- resetting a password bumps it, so every older session stops renewing within
-- ten minutes; deactivating an account does the same through `status`.
--
-- Additive and defaulted: tokens issued before this carry no version and read
-- as 0, which matches, so nobody is signed out by the deploy.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.token_version IS
  'Bumped on every password change or reset. Sessions carry it and stop renewing once it no longer matches (BUGS #3).';

-- Invitations by email, and password reset by one-time code.
--
-- Temporary passwords used to be read out by whoever onboarded someone. Now they are emailed with a
-- one-time link to choose a permanent password, and a person who forgets theirs gets a short code.
-- Both live in the existing one-time token table, told apart by purpose:
--
--   RESET_LINK  the original reset token, unchanged;
--   SETUP_LINK  the invitation link, which lets a new user choose their first password;
--   RESET_CODE  a six-digit code. Short enough to type, so it is also short enough to guess:
--               `attempts` counts wrong tries and the code is withdrawn after a few.

CREATE TYPE "PasswordTokenPurpose" AS ENUM ('RESET_LINK', 'SETUP_LINK', 'RESET_CODE');

ALTER TABLE "password_reset_tokens"
  ADD COLUMN "purpose" "PasswordTokenPurpose" NOT NULL DEFAULT 'RESET_LINK',
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "password_reset_tokens_user_id_purpose_idx"
  ON "password_reset_tokens"("user_id", "purpose");

-- Someone signed in with a password another person issued: until they choose their own, the app
-- takes them to set one before anything else.
ALTER TABLE "users" ADD COLUMN "password_change_required" BOOLEAN NOT NULL DEFAULT false;

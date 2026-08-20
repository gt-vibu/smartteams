ALTER TABLE "webauthn_credentials"
  ADD COLUMN "review_required" BOOLEAN NOT NULL DEFAULT false;

-- Someone joining after the leave year starts receives the part of a fixed annual allowance for
-- the months left in it. On by default: that is what an allowance "per year" means.
ALTER TABLE "leave_types" ADD COLUMN "prorate_for_joiners" BOOLEAN NOT NULL DEFAULT true;

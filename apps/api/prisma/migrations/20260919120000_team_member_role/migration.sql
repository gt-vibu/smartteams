-- A member's role within a team (Lead, Member, ...), from the organization's Team Roles list.
-- Nullable: memberships recorded before roles existed keep no role.
ALTER TABLE "team_members" ADD COLUMN "team_role" TEXT;

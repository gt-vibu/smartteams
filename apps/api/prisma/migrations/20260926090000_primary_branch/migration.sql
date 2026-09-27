-- The branch an organization treats as its main one: preselected for new hires, and the one a
-- blank branch on an imported row means. Null until chosen; the oldest active branch stands in.
ALTER TABLE organization_settings
  ADD COLUMN primary_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

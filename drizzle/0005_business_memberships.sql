CREATE TABLE IF NOT EXISTS business_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL,
  user_id TEXT,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('owner','manager','cashier')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','invited')),
  invited_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  accepted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_business_email ON business_memberships(business_id,email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_business_user ON business_memberships(business_id,user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membership_user ON business_memberships(user_id,status);
CREATE INDEX IF NOT EXISTS idx_membership_email ON business_memberships(email,status);

CREATE TABLE IF NOT EXISTS active_businesses (
  user_id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE business_memberships ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0;
ALTER TABLE business_memberships ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]';

UPDATE business_memberships SET is_owner = 1 WHERE role = 'owner';
UPDATE business_memberships SET permissions = '["sell","products","purchase","refund","reports","payments","members"]' WHERE role = 'manager';
UPDATE business_memberships SET permissions = '["sell"]' WHERE role = 'cashier';

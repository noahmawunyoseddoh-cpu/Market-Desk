import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const products = sqliteTable('products', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  name: text('name').notNull(), sku: text('sku').notNull().default(''),
  category: text('category').notNull().default('General'),
  price: integer('price').notNull(), quantity: integer('quantity').notNull().default(0),
  prices: text('prices'), revision: integer('revision').notNull().default(0),
  photo: text('photo').notNull().default(''), sample: integer('sample').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, t => [index('idx_products_owner').on(t.owner)]);
export const sales = sqliteTable('sales', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  invoice: text('invoice').notNull(), createdAt: text('created_at').notNull(),
  total: integer('total').notNull(), data: text('data').notNull(),
}, t => [index('idx_sales_owner_created').on(t.owner,t.createdAt)]);
export const businesses = sqliteTable('businesses', {
  owner: text('owner').primaryKey(), data: text('data').notNull(),
});
export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  createdAt: text('created_at').notNull(), data: text('data').notNull(),
}, t => [index('idx_purchases_owner_created').on(t.owner,t.createdAt)]);

export const adjustments=sqliteTable('adjustments',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),saleId:text('sale_id').notNull(),createdAt:text('created_at').notNull(),amount:integer('amount').notNull(),currency:text('currency').notNull(),data:text('data').notNull(),
},t=>[index('idx_adjustments_owner_sale').on(t.owner,t.saleId),index('idx_adjustments_date').on(t.owner,t.createdAt)]);
export const reconciliations=sqliteTable('reconciliations',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),createdAt:text('created_at').notNull(),data:text('data').notNull(),
},t=>[index('idx_reconciliations_owner').on(t.owner,t.createdAt)]);
export const shopRevision=sqliteTable('shop_revision',{owner:text('owner').primaryKey(),revision:integer('revision').notNull().default(0)});
export const auditEvents=sqliteTable('audit_events',{
 id:integer('id').primaryKey({autoIncrement:true}),owner:text('owner').notNull(),createdAt:text('created_at').notNull(),entity:text('entity').notNull(),action:text('action').notNull(),recordId:text('record_id').notNull(),data:text('data').notNull(),
},t=>[index('idx_audit_owner').on(t.owner,t.id)]);
export const backups=sqliteTable('backups',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),createdAt:text('created_at').notNull(),revision:integer('revision').notNull(),objectKey:text('object_key').notNull(),data:text('data').notNull(),
},t=>[index('idx_backups_owner').on(t.owner,t.createdAt)]);
export const restoreOperations=sqliteTable('restore_operations',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),backupId:text('backup_id').notNull(),createdAt:text('created_at').notNull(),
});

export const retiredOperations=sqliteTable('retired_operations',{id:text('id').primaryKey(),owner:text('owner').notNull(),entity:text('entity').notNull(),createdAt:text('created_at').notNull()});

export const businessMemberships=sqliteTable('business_memberships',{
 id:text('id').primaryKey(),businessId:text('business_id').notNull(),userId:text('user_id'),email:text('email').notNull(),displayName:text('display_name').notNull().default(''),role:text('role').notNull(),status:text('status').notNull().default('active'),invitedBy:text('invited_by').notNull().default(''),createdAt:text('created_at').notNull(),acceptedAt:text('accepted_at'),
 isOwner:integer('is_owner').notNull().default(0),permissions:text('permissions').notNull().default('[]'),
},t=>[index('idx_membership_user').on(t.userId,t.status),index('idx_membership_email').on(t.email,t.status)]);
export const activeBusinesses=sqliteTable('active_businesses',{userId:text('user_id').primaryKey(),businessId:text('business_id').notNull(),updatedAt:text('updated_at').notNull()});

export const users=sqliteTable('users',{
 id:text('id').primaryKey(),email:text('email').notNull(),displayName:text('display_name').notNull(),
 passwordHash:text('password_hash').notNull(),createdAt:text('created_at').notNull(),
 emailVerified:integer('email_verified').notNull().default(0),
});
export const sessions=sqliteTable('sessions',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),tokenHash:text('token_hash').notNull(),
 createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),
},t=>[index('idx_sessions_token').on(t.tokenHash),index('idx_sessions_user').on(t.userId)]);

export const emailVerifications=sqliteTable('email_verifications',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),tokenHash:text('token_hash').notNull(),
 createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),
},t=>[index('idx_email_verifications_token').on(t.tokenHash),index('idx_email_verifications_user').on(t.userId)]);

export const passwordResets=sqliteTable('password_resets',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),tokenHash:text('token_hash').notNull(),
 createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),
},t=>[index('idx_password_resets_token').on(t.tokenHash),index('idx_password_resets_user').on(t.userId)]);

export const accountDeletionFeedback=sqliteTable('account_deletion_feedback',{
 id:text('id').primaryKey(),email:text('email').notNull(),reasonCategory:text('reason_category').notNull(),
 reasonDetails:text('reason_details').notNull().default(''),createdAt:text('created_at').notNull(),
},t=>[index('idx_account_deletion_feedback_created').on(t.createdAt)]);

export const rateLimits=sqliteTable('rate_limits',{
 key:text('key').notNull(),windowStart:integer('window_start').notNull(),count:integer('count').notNull().default(0),
});

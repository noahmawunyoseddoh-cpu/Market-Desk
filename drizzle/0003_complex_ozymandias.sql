CREATE TABLE `adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`sale_id` text NOT NULL,
	`created_at` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_adjustments_owner_sale` ON `adjustments` (`owner`,`sale_id`);--> statement-breakpoint
CREATE INDEX `idx_adjustments_date` ON `adjustments` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL,
	`entity` text NOT NULL,
	`action` text NOT NULL,
	`record_id` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_owner` ON `audit_events` (`owner`,`id`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL,
	`revision` integer NOT NULL,
	`object_key` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_backups_owner` ON `backups` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reconciliations_owner` ON `reconciliations` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `restore_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`backup_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shop_revision` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER audit_products_insert AFTER INSERT ON products BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'products','insert',NEW.id,json_object('name',NEW.name,'quantity',NEW.quantity,'previousQuantity',NULL,'prices',NEW.prices,'price',NEW.price));
END;

--> statement-breakpoint
CREATE TRIGGER audit_products_update AFTER UPDATE ON products BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'products','update',NEW.id,json_object('name',NEW.name,'quantity',NEW.quantity,'previousQuantity',OLD.quantity,'prices',NEW.prices,'price',NEW.price));
END;

--> statement-breakpoint
CREATE TRIGGER audit_products_delete AFTER DELETE ON products BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (OLD.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(OLD.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'products','delete',OLD.id,json_object('name',OLD.name,'quantity',OLD.quantity,'previousQuantity',NULL,'prices',OLD.prices,'price',OLD.price));
END;

--> statement-breakpoint
CREATE TRIGGER audit_sales_insert AFTER INSERT ON sales BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'sales','insert',NEW.id,NEW.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_sales_update AFTER UPDATE ON sales BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'sales','update',NEW.id,NEW.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_sales_delete AFTER DELETE ON sales BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (OLD.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(OLD.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'sales','delete',OLD.id,OLD.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_purchases_insert AFTER INSERT ON purchases BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'purchases','insert',NEW.id,NEW.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_purchases_update AFTER UPDATE ON purchases BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'purchases','update',NEW.id,NEW.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_purchases_delete AFTER DELETE ON purchases BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (OLD.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(OLD.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'purchases','delete',OLD.id,OLD.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_businesses_insert AFTER INSERT ON businesses BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'businesses','insert',NEW.owner,NEW.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_businesses_update AFTER UPDATE ON businesses BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'businesses','update',NEW.owner,NEW.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_businesses_delete AFTER DELETE ON businesses BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (OLD.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(OLD.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'businesses','delete',OLD.owner,OLD.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_adjustments_insert AFTER INSERT ON adjustments BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'adjustments','insert',NEW.id,NEW.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_adjustments_update AFTER UPDATE ON adjustments BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'adjustments','update',NEW.id,NEW.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_adjustments_delete AFTER DELETE ON adjustments BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (OLD.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(OLD.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'adjustments','delete',OLD.id,OLD.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_reconciliations_insert AFTER INSERT ON reconciliations BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'reconciliations','insert',NEW.id,NEW.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_reconciliations_update AFTER UPDATE ON reconciliations BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (NEW.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(NEW.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'reconciliations','update',NEW.id,NEW.data);
END;

--> statement-breakpoint
CREATE TRIGGER audit_reconciliations_delete AFTER DELETE ON reconciliations BEGIN
 INSERT INTO shop_revision(owner,revision) VALUES (OLD.owner,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1;
 INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(OLD.owner,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'reconciliations','delete',OLD.id,OLD.data);
END;

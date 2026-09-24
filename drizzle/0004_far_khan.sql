CREATE TABLE `retired_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`entity` text NOT NULL,
	`created_at` text NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER retired_sales AFTER DELETE ON sales BEGIN INSERT OR IGNORE INTO retired_operations(id,owner,entity,created_at) VALUES(OLD.id,OLD.owner,'sales',strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

--> statement-breakpoint
CREATE TRIGGER retired_purchases AFTER DELETE ON purchases BEGIN INSERT OR IGNORE INTO retired_operations(id,owner,entity,created_at) VALUES(OLD.id,OLD.owner,'purchases',strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

--> statement-breakpoint
CREATE TRIGGER retired_adjustments AFTER DELETE ON adjustments BEGIN INSERT OR IGNORE INTO retired_operations(id,owner,entity,created_at) VALUES(OLD.id,OLD.owner,'adjustments',strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

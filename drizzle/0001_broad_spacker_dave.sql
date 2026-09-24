CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_purchases_owner_created` ON `purchases` (`owner`,`created_at`);
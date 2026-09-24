CREATE TABLE `businesses` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`price` integer NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`photo` text DEFAULT '' NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_products_owner` ON `products` (`owner`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`invoice` text NOT NULL,
	`created_at` text NOT NULL,
	`total` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sales_owner_created` ON `sales` (`owner`,`created_at`);
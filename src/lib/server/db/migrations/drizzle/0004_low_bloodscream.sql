CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text,
	`credits` integer DEFAULT 20 NOT NULL,
	`plan` text,
	`period_end` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

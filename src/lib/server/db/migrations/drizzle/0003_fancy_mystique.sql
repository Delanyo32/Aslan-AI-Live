CREATE TABLE `commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`what` text NOT NULL,
	`promised_date` integer,
	`source_url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`next_check_at` integer,
	`checked_at` integer,
	`check_evidence` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `commitments_company_idx` ON `commitments` (`company_id`);--> statement-breakpoint
CREATE INDEX `commitments_next_check_idx` ON `commitments` (`next_check_at`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`exa_entity` text,
	`is_us` integer DEFAULT false NOT NULL,
	`alpaca_symbol` text,
	`sector` text,
	`competitor_webset_id` text,
	`monitor_state` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_ticker_unique` ON `companies` (`ticker`);--> statement-breakpoint
CREATE TABLE `dimension_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`dimension` text NOT NULL,
	`grade` text NOT NULL,
	`score` integer NOT NULL,
	`confidence` text NOT NULL,
	`flags` text DEFAULT '[]' NOT NULL,
	`citations` text DEFAULT '[]' NOT NULL,
	`evidence_hash` text NOT NULL,
	`rubric_version` text NOT NULL,
	`report_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_id`) REFERENCES `terminal_reports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dimension_scores_company_dimension_created_idx` ON `dimension_scores` (`company_id`,`dimension`,`created_at`);--> statement-breakpoint
CREATE TABLE `evidence_items` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`source_domain` text NOT NULL,
	`published_at` integer,
	`snippet` text,
	`content_hash` text NOT NULL,
	`origin` text NOT NULL,
	`dimensions` text DEFAULT '[]' NOT NULL,
	`triage` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_items_company_content_hash_unique` ON `evidence_items` (`company_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `evidence_items_company_created_idx` ON `evidence_items` (`company_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `terminal_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`dimension` text NOT NULL,
	`old_grade` text,
	`new_grade` text NOT NULL,
	`reason` text NOT NULL,
	`citations` text DEFAULT '[]' NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`emailed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `terminal_alerts_user_read_created_idx` ON `terminal_alerts` (`user_id`,`read`,`created_at`);--> statement-breakpoint
CREATE TABLE `terminal_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`user_id` text,
	`company_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`rubric_version` text NOT NULL,
	`composite` text,
	`dimensions` text,
	`extraction` text,
	`verdict` text,
	`bear_bull` text,
	`narrative` text,
	`citations` text,
	`evidence_snapshot_hash` text,
	`credit_cost` integer DEFAULT 0 NOT NULL,
	`is_public` integer DEFAULT true NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terminal_reports_slug_unique` ON `terminal_reports` (`slug`);--> statement-breakpoint
CREATE TABLE `terminal_runs` (
	`session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`error` text,
	`result_slug` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watchlist_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`next_billing_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_entries_user_company_unique` ON `watchlist_entries` (`user_id`,`company_id`);
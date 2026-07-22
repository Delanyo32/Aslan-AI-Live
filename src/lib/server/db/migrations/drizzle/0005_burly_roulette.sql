PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_backtest_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`user_id` text,
	`email` text,
	`query` text NOT NULL,
	`event_spec` text NOT NULL,
	`exa_search` text NOT NULL,
	`rule` text NOT NULL,
	`confirmed_tickers` text NOT NULL,
	`occurrences` text NOT NULL,
	`impact_windows` text NOT NULL,
	`backtest_result` text NOT NULL,
	`low_confidence_events` text DEFAULT '[]' NOT NULL,
	`research_narrative` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_public` integer DEFAULT true NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_backtest_reports`("id", "slug", "user_id", "email", "query", "event_spec", "exa_search", "rule", "confirmed_tickers", "occurrences", "impact_windows", "backtest_result", "low_confidence_events", "research_narrative", "status", "is_public", "view_count", "created_at", "updated_at") SELECT "id", "slug", "user_id", "email", "query", "event_spec", "exa_search", "rule", "confirmed_tickers", "occurrences", "impact_windows", "backtest_result", "low_confidence_events", "research_narrative", "status", "is_public", "view_count", "created_at", "updated_at" FROM `backtest_reports`;--> statement-breakpoint
DROP TABLE `backtest_reports`;--> statement-breakpoint
ALTER TABLE `__new_backtest_reports` RENAME TO `backtest_reports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `backtest_reports_slug_unique` ON `backtest_reports` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_credit_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`backtest_id` text,
	`stripe_payment_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`backtest_id`) REFERENCES `backtest_reports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_credit_transactions`("id", "user_id", "amount", "reason", "backtest_id", "stripe_payment_id", "created_at") SELECT "id", "user_id", "amount", "reason", "backtest_id", "stripe_payment_id", "created_at" FROM `credit_transactions`;--> statement-breakpoint
DROP TABLE `credit_transactions`;--> statement-breakpoint
ALTER TABLE `__new_credit_transactions` RENAME TO `credit_transactions`;--> statement-breakpoint
CREATE TABLE `__new_terminal_alerts` (
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
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_terminal_alerts`("id", "user_id", "company_id", "dimension", "old_grade", "new_grade", "reason", "citations", "read", "emailed", "created_at") SELECT "id", "user_id", "company_id", "dimension", "old_grade", "new_grade", "reason", "citations", "read", "emailed", "created_at" FROM `terminal_alerts`;--> statement-breakpoint
DROP TABLE `terminal_alerts`;--> statement-breakpoint
ALTER TABLE `__new_terminal_alerts` RENAME TO `terminal_alerts`;--> statement-breakpoint
CREATE INDEX `terminal_alerts_user_read_created_idx` ON `terminal_alerts` (`user_id`,`read`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_terminal_reports` (
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
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_terminal_reports`("id", "slug", "user_id", "company_id", "status", "rubric_version", "composite", "dimensions", "extraction", "verdict", "bear_bull", "narrative", "citations", "evidence_snapshot_hash", "credit_cost", "is_public", "view_count", "created_at", "updated_at") SELECT "id", "slug", "user_id", "company_id", "status", "rubric_version", "composite", "dimensions", "extraction", "verdict", "bear_bull", "narrative", "citations", "evidence_snapshot_hash", "credit_cost", "is_public", "view_count", "created_at", "updated_at" FROM `terminal_reports`;--> statement-breakpoint
DROP TABLE `terminal_reports`;--> statement-breakpoint
ALTER TABLE `__new_terminal_reports` RENAME TO `terminal_reports`;--> statement-breakpoint
CREATE UNIQUE INDEX `terminal_reports_slug_unique` ON `terminal_reports` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_watchlist_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`next_billing_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_watchlist_entries`("id", "user_id", "company_id", "active", "next_billing_at", "created_at") SELECT "id", "user_id", "company_id", "active", "next_billing_at", "created_at" FROM `watchlist_entries`;--> statement-breakpoint
DROP TABLE `watchlist_entries`;--> statement-breakpoint
ALTER TABLE `__new_watchlist_entries` RENAME TO `watchlist_entries`;--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_entries_user_company_unique` ON `watchlist_entries` (`user_id`,`company_id`);
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`cik` text NOT NULL,
	`accession` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	`kind` text NOT NULL,
	`certainty` text NOT NULL,
	`period_start` text,
	`period_end` text NOT NULL,
	`fiscal_year` integer,
	`fiscal_period` text,
	`due_date` text,
	`inferred_due` integer DEFAULT false NOT NULL,
	`counterparty` text,
	`related_party` integer DEFAULT false NOT NULL,
	`taxonomy_tag` text,
	`source_location` text NOT NULL,
	`notes` text,
	`origin` text NOT NULL,
	`superseded` integer DEFAULT false NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_cik_content_hash_unique` ON `ledger_entries` (`cik`,`content_hash`);--> statement-breakpoint
CREATE INDEX `ledger_entries_cik_period_idx` ON `ledger_entries` (`cik`,`period_end`);--> statement-breakpoint
CREATE INDEX `ledger_entries_cik_accession_idx` ON `ledger_entries` (`cik`,`accession`);--> statement-breakpoint
CREATE TABLE `ledger_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`cik` text NOT NULL,
	`flag_type` text NOT NULL,
	`origin` text NOT NULL,
	`summary` text NOT NULL,
	`detail` text,
	`entry_ids` text DEFAULT '[]' NOT NULL,
	`citations` text DEFAULT '[]' NOT NULL,
	`period_end` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_flags_cik_type_idx` ON `ledger_flags` (`cik`,`flag_type`);--> statement-breakpoint
CREATE TABLE `reality_runs` (
	`session_id` text PRIMARY KEY NOT NULL,
	`cik` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reality_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`cik` text NOT NULL,
	`period_end` text NOT NULL,
	`fiscal_label` text NOT NULL,
	`currency` text NOT NULL,
	`draft` text NOT NULL,
	`adjusted` text NOT NULL,
	`adjustments` text DEFAULT '[]' NOT NULL,
	`narrative` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reality_statements_cik_period_unique` ON `reality_statements` (`cik`,`period_end`);
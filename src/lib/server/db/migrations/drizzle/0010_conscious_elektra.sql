ALTER TABLE `ledger_entries` ADD `amount_high` real;--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `value_type` text DEFAULT 'currency' NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `event_date` text;
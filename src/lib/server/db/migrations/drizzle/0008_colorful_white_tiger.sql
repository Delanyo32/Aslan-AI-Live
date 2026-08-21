CREATE TABLE `sec_companies` (
	`cik` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`last_synced_at` integer
);
--> statement-breakpoint
CREATE TABLE `sec_filings` (
	`accession` text PRIMARY KEY NOT NULL,
	`cik` text NOT NULL,
	`form` text NOT NULL,
	`filing_date` text NOT NULL,
	`report_date` text,
	`primary_document` text,
	`r2_prefix` text NOT NULL,
	`doc_count` integer NOT NULL,
	`bytes` integer NOT NULL,
	`downloaded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sec_filings_cik_form_date` ON `sec_filings` (`cik`,`form`,`filing_date`);
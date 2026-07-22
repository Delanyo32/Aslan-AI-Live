CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`report_id` text,
	`exa_agent_runs` integer DEFAULT 0 NOT NULL,
	`exa_searches` integer DEFAULT 0 NOT NULL,
	`exa_contents` integer DEFAULT 0 NOT NULL,
	`exa_websets` integer DEFAULT 0 NOT NULL,
	`est_cost_usd` real DEFAULT 0 NOT NULL,
	`credits_charged` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);

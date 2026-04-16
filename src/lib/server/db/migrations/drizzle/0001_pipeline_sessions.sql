CREATE TABLE `pipeline_sessions` (
  `id`                      TEXT PRIMARY KEY NOT NULL,
  `user_id`                 TEXT NOT NULL,
  `params_json`             TEXT NOT NULL,
  `confirmed_rule_json`     TEXT,
  `confirmed_tickers_json`  TEXT,
  `created_at`              INTEGER NOT NULL,
  `expires_at`              INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pipeline_sessions_expires` ON `pipeline_sessions` (`expires_at`);

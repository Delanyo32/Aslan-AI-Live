CREATE TABLE `pipeline_runs` (
  `session_id`  TEXT PRIMARY KEY NOT NULL,
  `user_id`     TEXT NOT NULL,
  `status`      TEXT NOT NULL,
  `stage`       TEXT NOT NULL,
  `error`       TEXT,
  `result_slug` TEXT,
  `created_at`  INTEGER NOT NULL,
  `updated_at`  INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pipeline_runs_user_id` ON `pipeline_runs` (`user_id`);
--> statement-breakpoint
CREATE INDEX `pipeline_runs_status`  ON `pipeline_runs` (`status`);

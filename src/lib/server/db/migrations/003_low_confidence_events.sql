-- ─────────────────────────────────────────────────────────────────────────────
-- 003_low_confidence_events.sql
-- Adds low_confidence_events column to backtest_reports.
-- Safe to run on live data: IF NOT EXISTS + DEFAULT '[]' leaves existing rows intact.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE backtest_reports
  ADD COLUMN IF NOT EXISTS low_confidence_events JSONB NOT NULL DEFAULT '[]'::jsonb;

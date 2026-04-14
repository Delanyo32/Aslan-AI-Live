CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  password_hash  TEXT,
  google_id      TEXT UNIQUE,
  name           TEXT,
  credits        INTEGER DEFAULT 3,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE backtest_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  user_id           UUID REFERENCES users(id),
  email             TEXT,
  query             TEXT NOT NULL,
  event_spec        JSONB NOT NULL,
  exa_search        JSONB NOT NULL,
  rule              JSONB NOT NULL,
  confirmed_tickers TEXT[] NOT NULL,
  occurrences       JSONB NOT NULL,
  impact_windows    JSONB NOT NULL,
  backtest_result   JSONB NOT NULL,
  research_narrative TEXT,
  status            TEXT DEFAULT 'pending',
  is_public         BOOLEAN DEFAULT true,
  view_count        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE email_captures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  report_id   UUID REFERENCES backtest_reports(id),
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  interest   TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE credit_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  amount            INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  backtest_id       UUID REFERENCES backtest_reports(id),
  stripe_payment_id TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON backtest_reports(slug);
CREATE INDEX ON backtest_reports(user_id);
CREATE INDEX ON backtest_reports(created_at DESC);

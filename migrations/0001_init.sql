CREATE TABLE IF NOT EXISTS section_registry (
  section_id TEXT PRIMARY KEY,
  section_family TEXT NOT NULL,
  input_text TEXT NOT NULL,
  reference_summary TEXT,
  expected_entities_json TEXT NOT NULL DEFAULT '[]',
  target_min_words INTEGER NOT NULL DEFAULT 12,
  target_max_words INTEGER NOT NULL DEFAULT 24,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  phase TEXT NOT NULL DEFAULT 'LIVE' CHECK (phase IN ('LIVE', 'HELDOUT')),
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_section_registry_enabled ON section_registry(enabled, phase, priority);
CREATE INDEX IF NOT EXISTS idx_section_registry_family ON section_registry(section_family, phase);

CREATE TABLE IF NOT EXISTS prompt_ledger (
  version_id TEXT PRIMARY KEY,
  parent_version_id TEXT,
  section_family TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  model TEXT NOT NULL,
  aggregate_score REAL NOT NULL DEFAULT 0,
  promotion_reason TEXT NOT NULL DEFAULT '',
  promoted_from_candidate_id TEXT,
  promoter_signature TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  rolled_back_from TEXT,
  promoted_cycle INTEGER NOT NULL DEFAULT 0,
  watch_until_cycle INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_ledger_active_family ON prompt_ledger(section_family, active) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_prompt_ledger_family_created ON prompt_ledger(section_family, created_at DESC);

CREATE TABLE IF NOT EXISTS promotion_queue (
  candidate_id TEXT PRIMARY KEY,
  proposer_hash TEXT NOT NULL,
  parent_version_id TEXT NOT NULL,
  section_family TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  model TEXT NOT NULL,
  source_feedback TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'EVALUATING', 'PROMOTED', 'REJECTED', 'EXPIRED')),
  score_prior REAL,
  score_post REAL,
  omega_prior REAL,
  omega_post REAL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lease_owner TEXT,
  lease_expires_at INTEGER,
  promoter_signature TEXT,
  attestation_ref TEXT,
  openai_eval_run_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_promotion_queue_state ON promotion_queue(state, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_promotion_queue_family ON promotion_queue(section_family, state);

CREATE TABLE IF NOT EXISTS ralph_iterations (
  iter_id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  section_family TEXT NOT NULL,
  parent_version_id TEXT NOT NULL,
  parent_prompt TEXT NOT NULL,
  candidate_prompt TEXT NOT NULL,
  mutation_summary TEXT NOT NULL,
  omega_score REAL NOT NULL,
  s_synthetic REAL NOT NULL,
  s_onchain REAL,
  eta_thermo REAL,
  c_norm REAL NOT NULL,
  delta_to_best REAL NOT NULL,
  stagnation_flag INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ralph_iterations_section ON ralph_iterations(section_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ralph_iterations_family ON ralph_iterations(section_family, created_at DESC);

CREATE TABLE IF NOT EXISTS pareto_front (
  section_family TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  s_synthetic REAL NOT NULL,
  s_onchain REAL NOT NULL DEFAULT 0,
  eta_thermo REAL NOT NULL DEFAULT 0,
  c_norm REAL NOT NULL,
  dominated INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (section_family, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_pareto_front_family ON pareto_front(section_family, dominated, updated_at DESC);

CREATE TABLE IF NOT EXISTS section_runs (
  run_id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  section_family TEXT NOT NULL,
  version_id TEXT,
  candidate_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('LIVE', 'HELDOUT', 'ACTIVE_BASELINE', 'CANDIDATE_BASELINE', 'RALPH_EXPLORATION')),
  cycle_index INTEGER NOT NULL,
  prompt_hash TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  synthetic_score REAL NOT NULL,
  omega_score REAL NOT NULL,
  s_onchain REAL,
  eta_thermo REAL,
  c_norm REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_section_runs_version ON section_runs(version_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_section_runs_family_cycle ON section_runs(section_family, cycle_index DESC);

CREATE TABLE IF NOT EXISTS cost_ledger (
  entry_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  usd_estimate REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  client_request_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_ledger_created ON cost_ledger(created_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  alert_id TEXT PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('P0', 'P1', 'P2')),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(resolved_at, created_at DESC);

CREATE TABLE IF NOT EXISTS system_state (
  state_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);


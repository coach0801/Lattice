-- Lattice Protocol — Neon PostgreSQL Schema v1.0
-- Run in Neon SQL editor: https://console.neon.tech

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ─────────────────────────────────────────────
-- nodes — one row per device on a DePIN network
-- ─────────────────────────────────────────────
create table if not exists nodes (
  network         text           not null,
  node_id         text           not null,
  owner_wallet    text,
  first_seen      timestamptz    not null default now(),
  last_seen       timestamptz    not null default now(),
  hardware_fp     text,
  lat             double precision,
  lng             double precision,
  metadata        jsonb          not null default '{}',
  schema_version  int            not null default 1,
  primary key (network, node_id)
);

create index if not exists idx_nodes_network      on nodes (network);
create index if not exists idx_nodes_owner_wallet on nodes (owner_wallet);
create index if not exists idx_nodes_location     on nodes (lat, lng) where lat is not null;

-- ─────────────────────────────────────────────
-- telemetry_events — raw ingest (append-only)
-- ─────────────────────────────────────────────
create table if not exists telemetry_events (
  id              bigserial      primary key,
  network         text           not null,
  node_id         text           not null,
  ts              timestamptz    not null,
  event_type      text           not null,  -- 'reading' | 'beacon' | 'claim' | 'movement'
  claimed_lat     double precision,
  claimed_lng     double precision,
  payload         jsonb          not null default '{}',
  payload_hash    text,                     -- sha256 of payload for replay detection
  reward_claim_id text,
  schema_version  int            not null default 1
);

create index if not exists idx_telemetry_node_ts   on telemetry_events (network, node_id, ts desc);
create index if not exists idx_telemetry_payload_h on telemetry_events (payload_hash) where payload_hash is not null;

-- ─────────────────────────────────────────────
-- reward_claims
-- ─────────────────────────────────────────────
create table if not exists reward_claims (
  network     text           not null,
  claim_id    text           not null,
  node_id     text           not null,
  ts          timestamptz    not null,
  amount      numeric(30, 8) not null,
  tx_hash     text,
  primary key (network, claim_id)
);

create index if not exists idx_reward_node on reward_claims (network, node_id, ts desc);

-- ─────────────────────────────────────────────
-- node_current_scores — one row per node, latest score
-- ─────────────────────────────────────────────
create table if not exists node_current_scores (
  network         text           not null,
  node_id         text           not null,
  composite_score int            not null check (composite_score between 0 and 100),
  band            text           not null,  -- 'clean' | 'watch' | 'suspicious' | 'sybil'
  sub_scores      jsonb          not null default '{}',
  attestation_id  text,
  model_version   text           not null default '0.1.0',
  updated_at      timestamptz    not null default now(),
  primary key (network, node_id)
);

create index if not exists idx_current_scores_band  on node_current_scores (network, band);
create index if not exists idx_current_scores_score on node_current_scores (network, composite_score asc);

-- ─────────────────────────────────────────────
-- score_history — append-only score changelog
-- ─────────────────────────────────────────────
create table if not exists score_history (
  id              bigserial      primary key,
  network         text           not null,
  node_id         text           not null,
  score           int            not null,
  band            text           not null,
  computed_at     timestamptz    not null default now(),
  model_version   text           not null default '0.1.0'
);

create index if not exists idx_score_history_node on score_history (network, node_id, computed_at desc);

-- ─────────────────────────────────────────────
-- detection_flags
-- ─────────────────────────────────────────────
create table if not exists detection_flags (
  flag_id         uuid           primary key default uuid_generate_v4(),
  network         text           not null,
  node_id         text           not null,
  flag_type       text           not null,  -- 'gps_plausibility' | 'timing_anomaly' | etc.
  severity        text           not null,  -- 'low' | 'medium' | 'high' | 'critical'
  confidence      double precision not null check (confidence between 0 and 1),
  details         jsonb          not null default '{}',
  detected_at     timestamptz    not null default now(),
  resolved_at     timestamptz,
  resolution      text           -- 'false_positive' | 'confirmed' | 'appealed'
);

create index if not exists idx_flags_node     on detection_flags (network, node_id, detected_at desc);
create index if not exists idx_flags_active   on detection_flags (network, flag_type) where resolved_at is null;

-- ─────────────────────────────────────────────
-- operator_clusters — coordinated farm groups
-- ─────────────────────────────────────────────
create table if not exists operator_clusters (
  cluster_id      uuid           primary key default uuid_generate_v4(),
  status          text           not null default 'active',  -- 'active' | 'dissolved'
  first_detected  timestamptz    not null default now(),
  last_updated    timestamptz    not null default now(),
  evidence        jsonb          not null default '{}'
);

create index if not exists idx_clusters_status on operator_clusters (status, first_detected desc);

-- ─────────────────────────────────────────────
-- cluster_members
-- ─────────────────────────────────────────────
create table if not exists cluster_members (
  cluster_id      uuid           not null references operator_clusters(cluster_id) on delete cascade,
  node_id         text           not null,
  network         text           not null,
  owner_wallet    text,
  confidence      double precision not null,
  role            text           not null default 'member',  -- 'hub' | 'member' | 'relay'
  first_detected  timestamptz    not null default now(),
  primary key (cluster_id, network, node_id)
);

create index if not exists idx_cluster_members_node on cluster_members (network, node_id);

-- ─────────────────────────────────────────────
-- attestation_records — on-chain attestation mirror
-- ─────────────────────────────────────────────
create table if not exists attestation_records (
  attestation_id  text           primary key,
  network         text           not null,
  node_id         text           not null,
  score           int            not null,
  evidence_cid    text,
  tx_hash         text,
  block_number    bigint,
  attested_at     timestamptz    not null default now(),
  status          text           not null default 'created',  -- 'created' | 'finalized_valid' | 'disputed' | 'finalized_upheld' | 'finalized_overturned'
  chain_id        int            not null default 11155420    -- OP Sepolia
);

create index if not exists idx_attestations_node   on attestation_records (network, node_id, attested_at desc);
create index if not exists idx_attestations_status on attestation_records (status);

-- ─────────────────────────────────────────────
-- disputes
-- ─────────────────────────────────────────────
create table if not exists disputes (
  dispute_id      text           primary key,
  attestation_id  text           not null references attestation_records(attestation_id),
  operator_wallet text           not null,
  bond_amount     numeric(30, 8) not null,
  evidence_cid    text,
  status          text           not null default 'open',
  opened_at       timestamptz    not null default now(),
  resolved_at     timestamptz,
  tx_hash         text
);

-- ─────────────────────────────────────────────
-- api_keys
-- ─────────────────────────────────────────────
create table if not exists api_keys (
  key_id          uuid           primary key default uuid_generate_v4(),
  key_hash        text           not null unique,
  partner_name    text           not null,
  partner_email   text           not null,
  rate_limit      int            not null default 100,
  created_at      timestamptz    not null default now(),
  last_used_at    timestamptz,
  is_active       boolean        not null default true
);

-- ─────────────────────────────────────────────
-- connector_health
-- ─────────────────────────────────────────────
create table if not exists connector_health (
  network         text           not null,
  checked_at      timestamptz    not null default now(),
  status          text           not null,
  events_ingested bigint         not null default 0,
  error_message   text,
  latency_ms      int,
  primary key (network, checked_at)
);

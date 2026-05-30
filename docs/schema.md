# Database Schema Reference

Lattice Protocol uses a **PostgreSQL** database (hosted on Supabase / Neon) defined in `infra/schema.sql`. This document describes each table, its columns, constraints, indexes, and the rationale behind design decisions.

---

## Extensions

| Extension | Purpose |
|-----------|---------|
| `uuid-ossp` | Generates RFC-4122 UUIDs for primary keys |
| `pg_trgm` | Enables trigram-based full-text search on node IDs and wallets |

---

## Tables

### `nodes`

Core registry of all known nodes across DePIN networks.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `network` | `text` | No | — | Network slug: `hivemapper`, `geodnet`, `weatherxm`, `dimo`, `nubila` |
| `node_id` | `text` | No | — | Unique node identifier within the network |
| `owner_wallet` | `text` | Yes | `NULL` | EVM wallet address of the node operator |
| `first_seen` | `timestamptz` | No | `now()` | Timestamp of first telemetry ingested |
| `last_seen` | `timestamptz` | No | `now()` | Timestamp of most recent telemetry |
| `hardware_fp` | `text` | Yes | `NULL` | Hardware fingerprint hash (SHA-256 of device identifiers) |
| `metadata` | `jsonb` | No | `{}` | Arbitrary network-specific metadata |
| `schema_version` | `int` | No | `1` | Schema evolution version for this row |

**Primary key:** `(network, node_id)`

**Indexes:**
- `idx_nodes_network` — supports listing all nodes by network
- `idx_nodes_owner_wallet` — enables cross-network wallet lookups
- `idx_nodes_hardware_fp` (partial, `WHERE hardware_fp IS NOT NULL`) — used for hardware fingerprint collision detection

---

### `telemetry_events`

Time-series table of all raw telemetry ingested from DePIN networks. **Partitioned by month** for query performance at scale.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigserial` | No | auto | Surrogate row ID |
| `network` | `text` | No | — | Network slug |
| `node_id` | `text` | No | — | Node identifier |
| `ts` | `timestamptz` | No | — | Event timestamp (partition key) |
| `event_type` | `text` | No | — | One of: `reading`, `beacon`, `claim`, `movement` |
| `claimed_lat` | `double precision` | Yes | `NULL` | Latitude reported by the node |
| `claimed_lng` | `double precision` | Yes | `NULL` | Longitude reported by the node |
| `payload` | `jsonb` | No | `{}` | Full event payload (network-specific schema) |
| `reward_claim_id` | `text` | Yes | `NULL` | Links to `reward_claims.claim_id` when event is reward-bearing |
| `schema_version` | `int` | No | `1` | Schema evolution version |

**Primary key:** `(id, ts)` — includes partition key as required by PG declarative partitioning.

**Partitioning:** `PARTITION BY RANGE (ts)` — monthly partitions from 2024-01 onwards. New partitions must be created before data for that month arrives.

**Indexes:**
- `idx_telemetry_node_ts` — primary access pattern: all events for a node ordered by time
- `idx_telemetry_event_type` — supports queries filtered by event type across a network
- `idx_telemetry_location` (GiST, partial) — spatial bounding-box queries for geographic clustering detection; only indexed when lat/lng are present

---

### `reward_claims`

Records of reward payouts from network incentive programs.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `network` | `text` | No | — | Network slug |
| `claim_id` | `text` | No | — | Network-assigned claim identifier |
| `node_id` | `text` | No | — | Claiming node |
| `ts` | `timestamptz` | No | — | Claim timestamp |
| `amount` | `numeric(30,8)` | No | — | Token amount claimed (high precision) |
| `tx_hash` | `text` | Yes | `NULL` | On-chain transaction hash |

**Primary key:** `(network, claim_id)`

**Indexes:**
- `idx_reward_claims_node` — chronological claim history per node
- `idx_reward_claims_ts` — global time-ordered scan for anomaly detection

---

### `node_scores`

**Append-only** history of integrity scores. Never update rows — always insert new scores.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigserial` | No | auto | Surrogate PK |
| `network` | `text` | No | — | Network slug |
| `node_id` | `text` | No | — | Node identifier |
| `score` | `int` | No | — | 0-100 integrity score (check constraint enforced) |
| `band` | `text` | No | — | `clean`, `watch`, `suspicious`, or `sybil` |
| `sub_scores` | `jsonb` | No | `{}` | Per-detector scores (see detector config) |
| `valid_from` | `timestamptz` | No | `now()` | When this score took effect |
| `model_version` | `text` | No | `0.1.0` | Scoring model version that produced this row |
| `attestation_id` | `text` | Yes | `NULL` | Links to `attestations.attestation_id` if on-chain |

**Indexes:**
- `idx_node_scores_node` — score history for a node
- `idx_node_scores_band` — bulk query by band (e.g. "all sybil nodes")
- `idx_node_scores_score` — range queries by score value

**Materialized view — `node_current_scores`:**
Uses `DISTINCT ON (network, node_id) ORDER BY valid_from DESC` to cheaply return the latest score per node. Refresh with `REFRESH MATERIALIZED VIEW CONCURRENTLY node_current_scores` after score ingestion runs.

---

### `detection_flags`

Individual anomaly signals raised by detectors against specific nodes.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | No | `uuid_generate_v4()` | Surrogate PK |
| `network` | `text` | No | — | Network slug |
| `node_id` | `text` | No | — | Flagged node |
| `detector` | `text` | No | — | Detector ID: `gps_plausibility`, `sensor_replay`, etc. |
| `severity` | `text` | No | — | `low`, `medium`, or `high` |
| `confidence` | `float` | No | — | 0.0-1.0 confidence score (check constraint) |
| `evidence` | `jsonb` | No | `{}` | Structured evidence payload for auditability |
| `detected_at` | `timestamptz` | No | `now()` | When the flag was raised |
| `resolved_at` | `timestamptz` | Yes | `NULL` | When the flag was resolved (NULL = still active) |
| `resolution` | `text` | Yes | `NULL` | `false_positive`, `confirmed`, or `appealed` |

**Indexes:**
- `idx_flags_node` — all flags for a node, newest first
- `idx_flags_detector` — all flags from a specific detector
- `idx_flags_unresolved` (partial, `WHERE resolved_at IS NULL`) — active flags only; critical for scoring pipeline

---

### `operator_clusters`

Detected groups of nodes believed to be controlled by the same Sybil operator.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `cluster_id` | `uuid` | No | `uuid_generate_v4()` | Surrogate PK |
| `member_count` | `int` | No | — | Total number of member nodes |
| `network_count` | `int` | No | — | Number of distinct networks represented |
| `mean_confidence` | `float` | No | — | Average edge confidence across cluster |
| `networks` | `text[]` | No | — | Array of network slugs present in cluster |
| `first_detected` | `timestamptz` | No | `now()` | When the cluster was first identified |
| `last_updated` | `timestamptz` | No | `now()` | Last time membership or metadata changed |
| `status` | `text` | No | `active` | `active` or `dissolved` |

---

### `cluster_members`

Junction table linking nodes to their operator cluster.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `cluster_id` | `uuid` | No | — | FK → `operator_clusters.cluster_id` |
| `network` | `text` | No | — | Node's network |
| `node_id` | `text` | No | — | Node identifier |
| `owner_wallet` | `text` | Yes | `NULL` | Wallet at time of clustering |
| `edge_confidence` | `float` | No | — | Confidence that this node belongs to the cluster |
| `joined_at` | `timestamptz` | No | `now()` | When this node was added to the cluster |

**Primary key:** `(cluster_id, network, node_id)`

**Indexes:**
- `idx_cluster_members_node` — find which clusters a node belongs to

---

### `attestations`

On-chain attestations mirrored from the `LatticeAttestation` smart contract on OP Sepolia.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `attestation_id` | `text` | No | — | On-chain attestation ID |
| `network` | `text` | No | — | Network slug |
| `node_id` | `text` | No | — | Attested node |
| `score` | `int` | No | — | Score at time of attestation |
| `evidence_cid` | `text` | Yes | `NULL` | IPFS CID of supporting evidence bundle |
| `tx_hash` | `text` | Yes | `NULL` | Transaction hash |
| `block_number` | `bigint` | Yes | `NULL` | Block number of attestation tx |
| `attested_at` | `timestamptz` | No | — | Attestation timestamp |
| `status` | `text` | No | `created` | `created`, `finalized_valid`, `disputed`, `finalized_upheld`, `finalized_overturned` |
| `chain_id` | `int` | No | `11155420` | Chain ID (11155420 = OP Sepolia) |

---

### `disputes`

On-chain dispute records for contested attestations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `dispute_id` | `text` | No | — | On-chain dispute ID |
| `attestation_id` | `text` | No | — | FK → `attestations.attestation_id` |
| `operator_wallet` | `text` | No | — | Wallet that opened the dispute |
| `bond_amount` | `numeric(30,8)` | No | — | Bond posted with the dispute |
| `evidence_cid` | `text` | Yes | `NULL` | IPFS CID of dispute evidence |
| `status` | `text` | No | `open` | `open`, `resolved_upheld`, `resolved_overturned` |
| `opened_at` | `timestamptz` | No | `now()` | When dispute was opened |
| `resolved_at` | `timestamptz` | Yes | `NULL` | Resolution timestamp |
| `tx_hash` | `text` | Yes | `NULL` | Resolution transaction hash |

---

### `connector_health`

Time-series health checks for each network's data ingestion connector.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `network` | `text` | No | — | Network slug |
| `checked_at` | `timestamptz` | No | `now()` | Health check timestamp |
| `status` | `text` | No | — | `ok`, `degraded`, or `down` |
| `events_ingested` | `bigint` | No | `0` | Events ingested since last check |
| `error_message` | `text` | Yes | `NULL` | Error details if degraded/down |
| `latency_ms` | `int` | Yes | `NULL` | Ingestion pipeline latency |

**Primary key:** `(network, checked_at)`

---

### `api_keys`

Partner API key registry. The actual key is never stored — only its SHA-256 hash.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `key_id` | `uuid` | No | `uuid_generate_v4()` | Surrogate PK |
| `key_hash` | `text` | No | — | SHA-256 of the raw API key (unique) |
| `partner_name` | `text` | No | — | Display name of the partner |
| `partner_email` | `text` | No | — | Contact email |
| `rate_limit` | `int` | No | `100` | Max requests per minute |
| `created_at` | `timestamptz` | No | `now()` | Key creation timestamp |
| `last_used_at` | `timestamptz` | Yes | `NULL` | Last authenticated request |
| `is_active` | `boolean` | No | `true` | Whether the key is currently valid |

---

### `webhook_subscriptions`

Webhook endpoint registrations for event-driven integrations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | No | `uuid_generate_v4()` | Surrogate PK |
| `key_id` | `uuid` | No | — | FK → `api_keys.key_id` |
| `callback_url` | `text` | No | — | HTTPS URL to POST events to |
| `event_types` | `text[]` | No | — | Array of subscribed event type strings |
| `hmac_secret` | `text` | No | — | Secret for `X-Lattice-Signature` HMAC |
| `is_active` | `boolean` | No | `true` | Whether the subscription is active |
| `created_at` | `timestamptz` | No | `now()` | Registration timestamp |

---

## Row-Level Security (RLS)

Supabase RLS is enabled on all core tables. The following policies apply:

| Table | Policy | Effect |
|-------|--------|--------|
| `nodes` | `public_read_nodes` | Anyone can `SELECT` |
| `node_scores` | `public_read_scores` | Anyone can `SELECT` |
| `detection_flags` | `public_read_flags` | Anyone can `SELECT` |
| `operator_clusters` | `public_read_clusters` | Anyone can `SELECT` |
| `attestations` | `public_read_attestations` | Anyone can `SELECT` |
| `telemetry_events` | `public_read_telemetry` | Anyone can `SELECT` |

All `INSERT`, `UPDATE`, and `DELETE` operations require the Supabase **service role key**, which bypasses RLS. The backend API server uses this key exclusively.

---

## Migration Notes

- The schema is currently at **version 0.1.0** (testnet / MVP).
- `telemetry_events` partitions must be created in advance. Add new monthly partitions before the start of each month using the pattern shown in `schema.sql`.
- The `node_current_scores` materialized view must be refreshed after each scoring run. Use `REFRESH MATERIALIZED VIEW CONCURRENTLY` to avoid locking reads.
- When adding new detectors, add their weight keys to the relevant `config/weights/*.yaml` files and update the `sub_scores` column documentation.
- `api_keys.rate_limit` is advisory in v0.1 — enforcement is in the API middleware, not the database.

/**
 * Lattice Protocol — Database Seed Script
 *
 * Creates all tables and seeds realistic data for 5 DePIN networks.
 * Includes:
 *  - 200–500 nodes per network with real geographic patterns
 *  - Telemetry events with realistic timing distributions
 *  - 10–15% sybil / suspicious nodes
 *  - 3–5 coordinated farm clusters
 *  - Score history (30 days)
 *  - Attestation records for clean/watch nodes
 *
 * Run: ts-node apps/web/scripts/seed.ts
 */

import { neon, NeonQueryFunction } from '@neondatabase/serverless'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as crypto from 'crypto'

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
  process.exit(1)
}

// neon() returns a tagged-template function; for raw DDL we use the underlying
// HTTP client directly by creating a fresh neon instance per query.
const sql = neon(DATABASE_URL)

// Execute a raw SQL string (no parameters) — used only for DDL statements.
async function execRaw(statement: string): Promise<void> {
  // The neon tagged template literal requires a real TemplateStringsArray.
  // We create a minimal one to pass a single raw string with no substitutions.
  const fake: TemplateStringsArray = Object.assign([statement], { raw: [statement] })
  await (sql as NeonQueryFunction<false, false>)(fake)
}

// ─── Seeded deterministic PRNG ────────────────────────────────────────────────

function createRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = Math.imul(1664525, s) + 1013904223
    s >>>= 0
    return s / 0xffffffff
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
-- Nodes: one row per unique sensor/device
CREATE TABLE IF NOT EXISTS nodes (
  node_id     TEXT NOT NULL,
  network     TEXT NOT NULL,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  last_seen   TIMESTAMPTZ,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (node_id, network)
);

-- Current score per node (replaces full recalc on every read)
CREATE TABLE IF NOT EXISTS node_current_scores (
  node_id         TEXT NOT NULL,
  network         TEXT NOT NULL,
  composite_score DOUBLE PRECISION NOT NULL DEFAULT 50,
  band            TEXT NOT NULL DEFAULT 'watch',
  sub_scores      JSONB DEFAULT '{}',
  attestation_id  TEXT,
  valid_from      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  score           DOUBLE PRECISION GENERATED ALWAYS AS (composite_score) STORED,
  PRIMARY KEY (node_id, network)
);

-- Score history (one row per daily recomputation)
CREATE TABLE IF NOT EXISTS score_history (
  id          BIGSERIAL PRIMARY KEY,
  node_id     TEXT NOT NULL,
  network     TEXT NOT NULL,
  score       DOUBLE PRECISION NOT NULL,
  band        TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_score_history_node ON score_history (node_id, network, computed_at DESC);

-- Detection flags (individual anomaly events)
CREATE TABLE IF NOT EXISTS detection_flags (
  flag_id     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  node_id     TEXT NOT NULL,
  network     TEXT NOT NULL,
  flag_type   TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  details     JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_flags_node ON detection_flags (node_id, network);
CREATE INDEX IF NOT EXISTS idx_flags_time ON detection_flags (detected_at DESC);

-- Operator clusters (coordinated Sybil farms)
CREATE TABLE IF NOT EXISTS operator_clusters (
  cluster_id    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  status        TEXT NOT NULL DEFAULT 'active',
  first_detected TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence      JSONB DEFAULT '{}'
);

-- Cluster membership
CREATE TABLE IF NOT EXISTS cluster_members (
  cluster_id     TEXT NOT NULL REFERENCES operator_clusters(cluster_id),
  node_id        TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'member',
  confidence     DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  first_detected TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cluster_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_cluster_members_node ON cluster_members (node_id);

-- Telemetry events
CREATE TABLE IF NOT EXISTS telemetry_events (
  id       BIGSERIAL,
  node_id  TEXT NOT NULL,
  network  TEXT NOT NULL,
  ts       TIMESTAMPTZ NOT NULL,
  payload  JSONB DEFAULT '{}',
  PRIMARY KEY (node_id, network, ts)
);
CREATE INDEX IF NOT EXISTS idx_telemetry_node_time ON telemetry_events (node_id, network, ts DESC);

-- Attestation records (on-chain proofs)
CREATE TABLE IF NOT EXISTS attestation_records (
  attestation_id TEXT PRIMARY KEY,
  node_id        TEXT NOT NULL,
  network        TEXT NOT NULL,
  score          DOUBLE PRECISION NOT NULL,
  attester       TEXT NOT NULL,
  attested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash        TEXT,
  chain_id       INT
);

-- API keys for webhook auth
CREATE TABLE IF NOT EXISTS api_keys (
  key_id      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key_hash    TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ
);

-- Webhook subscriptions
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  api_key_hash    TEXT NOT NULL,
  url             TEXT NOT NULL,
  events          TEXT[] NOT NULL,
  secret          TEXT,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  active          BOOLEAN DEFAULT true
);

-- Ingest log
CREATE TABLE IF NOT EXISTS ingest_log (
  id          BIGSERIAL PRIMARY KEY,
  network     TEXT NOT NULL,
  inserted    INT DEFAULT 0,
  updated     INT DEFAULT 0,
  duration_ms INT DEFAULT 0,
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

-- Detection run queue
CREATE TABLE IF NOT EXISTS detection_run_queue (
  network    TEXT PRIMARY KEY,
  queued_at  TIMESTAMPTZ DEFAULT NOW()
);
`

// ─── Network definitions ──────────────────────────────────────────────────────

interface NetworkDef {
  name: string
  nodeCount: number
  regions: Array<{ latMin: number; latMax: number; lngMin: number; lngMax: number }>
  sybilFraction: number
  suspiciousFraction: number
}

const NETWORKS: NetworkDef[] = [
  {
    name: 'weatherxm',
    nodeCount: 350,
    sybilFraction: 0.06,
    suspiciousFraction: 0.10,
    regions: [
      { latMin: 35, latMax: 42, lngMin: 20, lngMax: 30 }, // Greece
      { latMin: 48, latMax: 55, lngMin: 8, lngMax: 18 }, // Central EU
      { latMin: 37, latMax: 45, lngMin: -8, lngMax: 5 }, // W. Europe
      { latMin: 30, latMax: 45, lngMin: -100, lngMax: -75 }, // US
    ],
  },
  {
    name: 'hivemapper',
    nodeCount: 280,
    sybilFraction: 0.10,
    suspiciousFraction: 0.12,
    regions: [
      { latMin: 34, latMax: 48, lngMin: -124, lngMax: -105 }, // US West
      { latMin: 36, latMax: 45, lngMin: -80, lngMax: -70 }, // US East
      { latMin: 50, latMax: 54, lngMin: -3, lngMax: 15 }, // N. Europe
      { latMin: 33, latMax: 43, lngMin: 130, lngMax: 145 }, // Japan
    ],
  },
  {
    name: 'dimo',
    nodeCount: 220,
    sybilFraction: 0.05,
    suspiciousFraction: 0.08,
    regions: [
      { latMin: 40.5, latMax: 41.0, lngMin: -74.2, lngMax: -73.8 }, // NYC
      { latMin: 33.7, latMax: 34.2, lngMin: -118.6, lngMax: -118.0 }, // LA
      { latMin: 41.7, latMax: 42.1, lngMin: -87.9, lngMax: -87.5 }, // Chicago
      { latMin: 47.4, latMax: 47.8, lngMin: 8.4, lngMax: 8.7 }, // Zurich
    ],
  },
  {
    name: 'helium-iot',
    nodeCount: 300,
    sybilFraction: 0.15,
    suspiciousFraction: 0.12,
    regions: [
      { latMin: 37, latMax: 38, lngMin: -122.5, lngMax: -121.9 }, // SF
      { latMin: 40.6, latMax: 41.0, lngMin: -74.1, lngMax: -73.7 }, // NYC
      { latMin: 51.4, latMax: 51.6, lngMin: -0.3, lngMax: 0.1 }, // London
      { latMin: 48.7, latMax: 48.9, lngMin: 2.2, lngMax: 2.5 }, // Paris
      { latMin: 52.4, latMax: 52.6, lngMin: 13.3, lngMax: 13.5 }, // Berlin
    ],
  },
  {
    name: 'helium-mobile',
    nodeCount: 200,
    sybilFraction: 0.08,
    suspiciousFraction: 0.10,
    regions: [
      { latMin: 25, latMax: 50, lngMin: -125, lngMax: -65 }, // US broad
      { latMin: 45, latMax: 55, lngMin: -5, lngMax: 20 }, // Europe broad
    ],
  },
]

// ─── Score bands ──────────────────────────────────────────────────────────────

type Band = 'clean' | 'watch' | 'suspicious' | 'sybil'

function getBand(score: number): Band {
  if (score >= 80) return 'clean'
  if (score >= 50) return 'watch'
  if (score >= 25) return 'suspicious'
  return 'sybil'
}

function rollScore(rng: () => number, category: 'sybil' | 'suspicious' | 'watch' | 'clean'): number {
  switch (category) {
    case 'sybil': return Math.round(rng() * 24)
    case 'suspicious': return Math.round(25 + rng() * 24)
    case 'watch': return Math.round(50 + rng() * 29)
    case 'clean': return Math.round(80 + rng() * 20)
  }
}

function categorizeNode(
  index: number,
  sybilFrac: number,
  suspiciousFrac: number
): 'sybil' | 'suspicious' | 'watch' | 'clean' {
  const rng = createRng(index * 7919)
  const roll = rng()
  if (roll < sybilFrac) return 'sybil'
  if (roll < sybilFrac + suspiciousFrac) return 'suspicious'
  if (roll < sybilFrac + suspiciousFrac + 0.15) return 'watch'
  return 'clean'
}

// ─── Flag generation ──────────────────────────────────────────────────────────

const FLAG_TYPES_BY_CATEGORY: Record<string, string[]> = {
  sybil: ['sensor_replay', 'gps_teleportation', 'geo_cluster', 'timing_roundness', 'scripted_periodicity'],
  suspicious: ['timing_roundness', 'geo_cluster', 'high_correlation', 'low_entropy'],
  watch: ['low_entropy', 'high_correlation'],
  clean: [],
}

function getFlagSeverity(flagType: string): 'low' | 'medium' | 'high' | 'critical' {
  const highFlags = ['sensor_replay', 'gps_teleportation', 'scripted_periodicity']
  const criticalFlags = ['geo_cluster']
  if (criticalFlags.includes(flagType)) return 'critical'
  if (highFlags.includes(flagType)) return 'high'
  return 'medium'
}

// ─── Attestation ID ───────────────────────────────────────────────────────────

function generateAttestationId(nodeId: string, network: string, score: number): string {
  const hash = crypto.createHash('sha256').update(`${nodeId}:${network}:${score}:lattice`).digest('hex')
  return `0x${hash.slice(0, 40)}`
}

// ─── Main seed logic ──────────────────────────────────────────────────────────

async function runSchema(): Promise<void> {
  console.log('Creating schema...')
  // Split and run each statement
  const statements = SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)
  for (const stmt of statements) {
    try {
      await execRaw(stmt)
    } catch (err) {
      // Some statements may fail on re-run (indexes already exist etc.) — that's OK
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('already exists')) {
        console.warn(`Schema warning: ${msg.slice(0, 120)}`)
      }
    }
  }
  console.log('Schema ready.')
}

interface NodeRow {
  nodeId: string
  network: string
  lat: number
  lng: number
  score: number
  band: Band
  category: 'sybil' | 'suspicious' | 'watch' | 'clean'
}

async function seedNetwork(net: NetworkDef): Promise<NodeRow[]> {
  console.log(`\nSeeding ${net.name} (${net.nodeCount} nodes)...`)
  const rng = createRng(net.name.split('').reduce((s, c) => s + c.charCodeAt(0), 0))
  const now = new Date()

  const nodes: NodeRow[] = []

  for (let i = 0; i < net.nodeCount; i++) {
    const region = net.regions[i % net.regions.length]
    const lat = region.latMin + rng() * (region.latMax - region.latMin)
    const lng = region.lngMin + rng() * (region.lngMax - region.lngMin)

    const category = categorizeNode(i, net.sybilFraction, net.suspiciousFraction)
    const nodeRng = createRng(i * 31337 + net.name.charCodeAt(0))
    const score = rollScore(nodeRng, category)
    const band = getBand(score)
    const nodeId = `${net.name}-${String(i).padStart(5, '0')}`
    const lastSeen = new Date(now.getTime() - Math.floor(rng() * 1000 * 60 * 60 * 48))

    nodes.push({ nodeId, network: net.name, lat, lng, score, band, category })

    // Insert node
    await sql`
      INSERT INTO nodes (node_id, network, lat, lng, last_seen, metadata)
      VALUES (
        ${nodeId}, ${net.name},
        ${Math.round(lat * 10000) / 10000},
        ${Math.round(lng * 10000) / 10000},
        ${lastSeen.toISOString()},
        ${{ index: i, category } as unknown as string}
      )
      ON CONFLICT (node_id, network) DO UPDATE
        SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, last_seen = EXCLUDED.last_seen
    `

    // Sub scores
    const subScores = {
      gps: Math.min(1, Math.max(0, (score / 100) + (nodeRng() * 0.2 - 0.1))),
      timing: Math.min(1, Math.max(0, (score / 100) + (nodeRng() * 0.15 - 0.075))),
      replay: Math.min(1, Math.max(0, (score / 100) + (nodeRng() * 0.1 - 0.05))),
      geo: Math.min(1, Math.max(0, (score / 100) + (nodeRng() * 0.12 - 0.06))),
    }

    const attestationId =
      band === 'clean' || band === 'watch'
        ? generateAttestationId(nodeId, net.name, score)
        : null

    // Insert current score
    await sql`
      INSERT INTO node_current_scores (node_id, network, composite_score, band, sub_scores, attestation_id, updated_at)
      VALUES (
        ${nodeId}, ${net.name}, ${score}, ${band},
        ${subScores as unknown as string},
        ${attestationId},
        ${now.toISOString()}
      )
      ON CONFLICT (node_id, network) DO UPDATE
        SET composite_score = EXCLUDED.composite_score,
            band = EXCLUDED.band,
            sub_scores = EXCLUDED.sub_scores,
            attestation_id = EXCLUDED.attestation_id,
            updated_at = EXCLUDED.updated_at
    `

    // Score history (30 days)
    for (let day = 0; day < 30; day++) {
      const histDate = new Date(now)
      histDate.setDate(histDate.getDate() - (29 - day))
      const histDrift = nodeRng() * 10 - 5
      const histScore = Math.min(100, Math.max(0, Math.round(score + histDrift)))
      const histBand = getBand(histScore)

      await sql`
        INSERT INTO score_history (node_id, network, score, band, computed_at)
        VALUES (${nodeId}, ${net.name}, ${histScore}, ${histBand}, ${histDate.toISOString()})
        ON CONFLICT DO NOTHING
      `
    }

    // Attestations for clean/watch nodes
    if (attestationId && (band === 'clean' || band === 'watch')) {
      const txHash = `0x${crypto.createHash('sha256').update(attestationId).digest('hex')}`
      await sql`
        INSERT INTO attestation_records (attestation_id, node_id, network, score, attester, attested_at, tx_hash, chain_id)
        VALUES (
          ${attestationId}, ${nodeId}, ${net.name}, ${score},
          '0xLatticeAttesterV1',
          ${new Date(now.getTime() - nodeRng() * 1000 * 60 * 60 * 24).toISOString()},
          ${txHash},
          11155420
        )
        ON CONFLICT (attestation_id) DO NOTHING
      `
    }

    // Flags for sybil/suspicious nodes
    const flagTypes = FLAG_TYPES_BY_CATEGORY[category] ?? []
    const numFlags = category === 'sybil' ? 3 : category === 'suspicious' ? 2 : category === 'watch' ? 1 : 0

    for (let f = 0; f < Math.min(numFlags, flagTypes.length); f++) {
      const flagType = flagTypes[f]
      const severity = getFlagSeverity(flagType)
      const detectedAt = new Date(now.getTime() - nodeRng() * 1000 * 60 * 60 * 72)
      const flagId = `flag-${nodeId}-${f}`

      await sql`
        INSERT INTO detection_flags (flag_id, node_id, network, flag_type, severity, detected_at, details)
        VALUES (
          ${flagId}, ${nodeId}, ${net.name}, ${flagType}, ${severity},
          ${detectedAt.toISOString()},
          ${{ confidence: Math.round(nodeRng() * 30 + 70) / 100 } as unknown as string}
        )
        ON CONFLICT (flag_id) DO NOTHING
      `
    }

    // Telemetry events (sample: 24 events over last 24 hours)
    const telemetryCount = Math.floor(nodeRng() * 20 + 10)
    for (let t = 0; t < telemetryCount; t++) {
      const tOffset = t * (24 / telemetryCount)
      const jitter = category === 'sybil' ? 0 : nodeRng() * 600 // scripted = no jitter
      const tTs = new Date(now.getTime() - (tOffset * 3600 * 1000) - jitter * 1000)
      const payloadHash = crypto.createHash('md5').update(`${nodeId}:${t}:${score}`).digest('hex')

      await sql`
        INSERT INTO telemetry_events (node_id, network, ts, payload)
        VALUES (
          ${nodeId}, ${net.name}, ${tTs.toISOString()},
          ${{
            value: Math.round(nodeRng() * 100 * 10) / 10,
            hash: payloadHash,
          } as unknown as string}
        )
        ON CONFLICT DO NOTHING
      `
    }
  }

  console.log(`  ${net.name}: ${nodes.length} nodes inserted`)
  return nodes
}

// ─── Cluster seeding ──────────────────────────────────────────────────────────

async function seedClusters(allNodes: NodeRow[]): Promise<void> {
  console.log('\nSeeding Sybil clusters...')

  // Pick sybil nodes across networks to form clusters
  const sybilNodes = allNodes.filter((n) => n.category === 'sybil')
  const suspiciousNodes = allNodes.filter((n) => n.category === 'suspicious')

  const clusterDefs = [
    {
      name: 'Alpha Farm — Helium IoT (SF Bay)',
      networkFilter: 'helium-iot',
      size: 12,
      confidence: 0.94,
      role: 'seed',
    },
    {
      name: 'Beta Farm — Cross-Network (EU)',
      networkFilter: null, // cross-network
      size: 18,
      confidence: 0.88,
      role: 'coordinator',
    },
    {
      name: 'Gamma Farm — WeatherXM (Greece)',
      networkFilter: 'weatherxm',
      size: 9,
      confidence: 0.91,
      role: 'member',
    },
    {
      name: 'Delta Farm — Hivemapper (US West)',
      networkFilter: 'hivemapper',
      size: 14,
      confidence: 0.85,
      role: 'member',
    },
    {
      name: 'Epsilon Farm — DIMO (NYC)',
      networkFilter: 'dimo',
      size: 7,
      confidence: 0.79,
      role: 'member',
    },
  ]

  for (let ci = 0; ci < clusterDefs.length; ci++) {
    const def = clusterDefs[ci]
    const clusterId = `cluster-${crypto.createHash('sha256').update(def.name).digest('hex').slice(0, 8)}`
    const now = new Date()
    const firstDetected = new Date(now.getTime() - (ci + 1) * 1000 * 60 * 60 * 24 * 5)

    // Pick candidate nodes
    let candidates = [...sybilNodes, ...suspiciousNodes.slice(0, 20)]
    if (def.networkFilter) {
      candidates = candidates.filter((n) => n.network === def.networkFilter)
    }

    if (candidates.length < 2) {
      console.log(`  Skipping cluster ${def.name} (not enough candidates)`)
      continue
    }

    const members = candidates.slice(0, Math.min(def.size, candidates.length))

    const involvedNetworks = [...new Set(members.map((n) => n.network))]

    await sql`
      INSERT INTO operator_clusters (cluster_id, status, first_detected, last_updated, evidence)
      VALUES (
        ${clusterId}, 'active', ${firstDetected.toISOString()}, ${now.toISOString()},
        ${{
          name: def.name,
          networks: involvedNetworks,
          shared_payload_hashes: Math.floor(Math.random() * 30 + 10),
          correlated_pairs: Math.floor(Math.random() * 15 + 5),
          geographic_radius_m: Math.floor(Math.random() * 80 + 20),
        } as unknown as string}
      )
      ON CONFLICT (cluster_id) DO UPDATE
        SET status = 'active', last_updated = EXCLUDED.last_updated
    `

    for (let mi = 0; mi < members.length; mi++) {
      const member = members[mi]
      const role = mi === 0 ? 'seed' : mi < 3 ? 'coordinator' : 'member'
      const confidence = def.confidence - mi * 0.01

      await sql`
        INSERT INTO cluster_members (cluster_id, node_id, role, confidence, first_detected)
        VALUES (${clusterId}, ${member.nodeId}, ${role}, ${confidence}, ${firstDetected.toISOString()})
        ON CONFLICT DO NOTHING
      `
    }

    console.log(`  Cluster "${def.name}": ${members.length} members (${involvedNetworks.join(', ')})`)
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Lattice Protocol Seed ===')
  console.log(`Database: ${DATABASE_URL!.replace(/:([^:@]+)@/, ':***@')}`)

  await runSchema()

  const allNodes: NodeRow[] = []

  for (const net of NETWORKS) {
    const nodes = await seedNetwork(net)
    allNodes.push(...nodes)
  }

  await seedClusters(allNodes)

  // Print summary
  const totalClean = allNodes.filter((n) => n.band === 'clean').length
  const totalWatch = allNodes.filter((n) => n.band === 'watch').length
  const totalSuspicious = allNodes.filter((n) => n.band === 'suspicious').length
  const totalSybil = allNodes.filter((n) => n.band === 'sybil').length

  console.log('\n=== Seed Summary ===')
  console.log(`Total nodes:    ${allNodes.length}`)
  console.log(`  Clean:        ${totalClean} (${((totalClean / allNodes.length) * 100).toFixed(1)}%)`)
  console.log(`  Watch:        ${totalWatch} (${((totalWatch / allNodes.length) * 100).toFixed(1)}%)`)
  console.log(`  Suspicious:   ${totalSuspicious} (${((totalSuspicious / allNodes.length) * 100).toFixed(1)}%)`)
  console.log(`  Sybil:        ${totalSybil} (${((totalSybil / allNodes.length) * 100).toFixed(1)}%)`)
  console.log('\nSeed complete!')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

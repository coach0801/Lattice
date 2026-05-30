import { neon, NeonQueryFunction } from '@neondatabase/serverless'

// Safe at build time — all query helpers have try/catch so null sql just throws → caught → mock fallback used
const sql = (process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : null) as NeonQueryFunction<false, false>

export { sql }

export type SqlClient = NeonQueryFunction<false, false>

// ─── Type definitions ──────────────────────────────────────────────────────────

export interface NetworkHealth {
  network: string
  total_nodes: number
  mean_score: number
  flagged_count: number
  cluster_count: number
  score_distribution: ScoreBand[]
  recent_flags: RecentFlag[]
}

export interface ScoreBand {
  band: 'clean' | 'watch' | 'suspicious' | 'sybil'
  min_score: number
  max_score: number
  count: number
}

export interface RecentFlag {
  flag_id: string
  node_id: string
  flag_type: string
  severity: string
  detected_at: string
  details: Record<string, unknown>
}

export interface NodeScore {
  node_id: string
  network: string
  score: number
  band: 'clean' | 'watch' | 'suspicious' | 'sybil'
  sub_scores: {
    gps?: number
    timing?: number
    replay?: number
    geo?: number
  }
  attestation_id: string | null
  updated_at: string
}

export interface NodeDetail {
  node_id: string
  network: string
  current_score: number
  band: 'clean' | 'watch' | 'suspicious' | 'sybil'
  sub_scores: Record<string, number>
  score_history: ScoreHistoryPoint[]
  active_flags: ActiveFlag[]
  cluster_memberships: ClusterMembership[]
  telemetry_summary: TelemetrySummary
}

export interface ScoreHistoryPoint {
  date: string
  score: number
  band: string
}

export interface ActiveFlag {
  flag_id: string
  flag_type: string
  severity: string
  detected_at: string
  details: Record<string, unknown>
}

export interface ClusterMembership {
  cluster_id: string
  role: string
  confidence: number
  first_detected: string
}

export interface TelemetrySummary {
  total_events: number
  first_seen: string
  last_seen: string
  uptime_pct: number
  avg_interval_seconds: number
}

export interface ActiveCluster {
  cluster_id: string
  network_count: number
  networks: string[]
  member_count: number
  mean_confidence: number
  first_detected: string
  status: string
}

export interface ClusterDetail {
  cluster_id: string
  status: string
  first_detected: string
  last_updated: string
  member_count: number
  network_count: number
  networks: string[]
  mean_confidence: number
  members_by_network: Record<string, ClusterMember[]>
  evidence_summary: EvidenceSummary
}

export interface ClusterMember {
  node_id: string
  network: string
  confidence: number
  role: string
  score: number
  first_detected: string
}

export interface EvidenceSummary {
  flag_types: Record<string, number>
  total_flags: number
  shared_payload_hashes: number
  correlated_pairs: number
  geographic_radius_m: number | null
}

export interface GlobalStats {
  total_nodes: number
  flags_24h: number
  clusters_active: number
  mean_score: number
  attestations_total: number
  networks: NetworkSummary[]
}

export interface NetworkSummary {
  name: string
  total_nodes: number
  mean_score: number
  flagged_pct: number
}

export interface NetworkNode {
  node_id: string
  network: string
  score: number
  band: 'clean' | 'watch' | 'suspicious' | 'sybil'
  sub_scores: Record<string, number>
  lat: number | null
  lng: number | null
  last_seen: string | null
  flag_count: number
}

export interface GetNetworkNodesOpts {
  page: number
  limit: number
  band?: 'clean' | 'watch' | 'suspicious' | 'sybil'
  sort: 'score_asc' | 'score_desc' | 'flagged'
}

// ─── Query Helpers ─────────────────────────────────────────────────────────────

export async function getNetworkHealth(network: string): Promise<NetworkHealth | null> {
  try {
    const rows = await sql`
      SELECT
        n.network,
        COUNT(DISTINCT n.node_id)::int AS total_nodes,
        ROUND(AVG(s.composite_score)::numeric, 2)::float AS mean_score,
        COUNT(DISTINCT CASE WHEN f.flag_id IS NOT NULL AND f.resolved_at IS NULL THEN n.node_id END)::int AS flagged_count,
        COUNT(DISTINCT cm.cluster_id)::int AS cluster_count
      FROM nodes n
      LEFT JOIN node_current_scores s ON s.node_id = n.node_id AND s.network = n.network
      LEFT JOIN detection_flags f ON f.node_id = n.node_id AND f.network = n.network
      LEFT JOIN cluster_members cm ON cm.node_id = n.node_id
      WHERE n.network = ${network}
      GROUP BY n.network
    `

    if (rows.length === 0) return null

    const distRows = await sql`
      SELECT
        CASE
          WHEN composite_score >= 80 THEN 'clean'
          WHEN composite_score >= 50 THEN 'watch'
          WHEN composite_score >= 25 THEN 'suspicious'
          ELSE 'sybil'
        END AS band,
        COUNT(*)::int AS count
      FROM node_current_scores
      WHERE network = ${network}
      GROUP BY band
    `

    const recentFlagsRows = await sql`
      SELECT flag_id, node_id, flag_type, severity, detected_at, details
      FROM detection_flags
      WHERE network = ${network} AND resolved_at IS NULL
      ORDER BY detected_at DESC
      LIMIT 10
    `

    const bandMap: Record<string, { min: number; max: number }> = {
      clean: { min: 80, max: 100 },
      watch: { min: 50, max: 79 },
      suspicious: { min: 25, max: 49 },
      sybil: { min: 0, max: 24 },
    }

    const score_distribution: ScoreBand[] = (['clean', 'watch', 'suspicious', 'sybil'] as const).map(
      (band) => ({
        band,
        min_score: bandMap[band].min,
        max_score: bandMap[band].max,
        count: (distRows.find((r) => r.band === band)?.count as number) ?? 0,
      })
    )

    return {
      network: rows[0].network as string,
      total_nodes: rows[0].total_nodes as number,
      mean_score: rows[0].mean_score as number,
      flagged_count: rows[0].flagged_count as number,
      cluster_count: rows[0].cluster_count as number,
      score_distribution,
      recent_flags: recentFlagsRows.map((r) => ({
        flag_id: r.flag_id as string,
        node_id: r.node_id as string,
        flag_type: r.flag_type as string,
        severity: r.severity as string,
        detected_at: (r.detected_at as Date).toISOString(),
        details: (r.details as Record<string, unknown>) ?? {},
      })),
    }
  } catch (err) {
    console.error('[db] getNetworkHealth error:', err)
    return null
  }
}

export async function getNodeScore(network: string, nodeId: string): Promise<NodeScore | null> {
  try {
    const rows = await sql`
      SELECT
        s.node_id,
        s.network,
        s.composite_score,
        s.band,
        s.sub_scores,
        s.attestation_id,
        s.updated_at
      FROM node_current_scores s
      WHERE s.network = ${network} AND s.node_id = ${nodeId}
      LIMIT 1
    `

    if (rows.length === 0) return null

    const r = rows[0]
    return {
      node_id: r.node_id as string,
      network: r.network as string,
      score: r.composite_score as number,
      band: r.band as NodeScore['band'],
      sub_scores: (r.sub_scores as NodeScore['sub_scores']) ?? {},
      attestation_id: r.attestation_id as string | null,
      updated_at: (r.updated_at as Date).toISOString(),
    }
  } catch (err) {
    console.error('[db] getNodeScore error:', err)
    return null
  }
}

export async function getNodeDetail(network: string, nodeId: string): Promise<NodeDetail | null> {
  try {
    const scoreRow = await getNodeScore(network, nodeId)
    if (!scoreRow) return null

    const historyRows = await sql`
      SELECT score, band, computed_at
      FROM score_history
      WHERE network = ${network} AND node_id = ${nodeId}
        AND computed_at >= NOW() - INTERVAL '30 days'
      ORDER BY computed_at ASC
    `

    const flagRows = await sql`
      SELECT flag_id, flag_type, severity, detected_at, details
      FROM detection_flags
      WHERE network = ${network} AND node_id = ${nodeId} AND resolved_at IS NULL
      ORDER BY detected_at DESC
    `

    const clusterRows = await sql`
      SELECT cm.cluster_id, cm.role, cm.confidence, cm.first_detected
      FROM cluster_members cm
      JOIN operator_clusters oc ON oc.cluster_id = cm.cluster_id
      WHERE cm.node_id = ${nodeId} AND oc.status = 'active'
    `

    const telemetryRow = await sql`
      SELECT
        COUNT(*)::int AS total_events,
        MIN(ts) AS first_seen,
        MAX(ts) AS last_seen
      FROM telemetry_events
      WHERE network = ${network} AND node_id = ${nodeId}
    `

    const t = telemetryRow[0]
    const firstSeen = t?.first_seen ? new Date(t.first_seen as string) : null
    const lastSeen = t?.last_seen ? new Date(t.last_seen as string) : null
    const totalEvents = (t?.total_events as number) ?? 0

    let avgIntervalSeconds = 0
    let uptimePct = 0

    if (firstSeen && lastSeen && totalEvents > 1) {
      const spanSeconds = (lastSeen.getTime() - firstSeen.getTime()) / 1000
      avgIntervalSeconds = Math.round(spanSeconds / (totalEvents - 1))
      const expectedIntervals = spanSeconds / 3600 // hourly expected
      uptimePct = Math.min(100, Math.round((totalEvents / expectedIntervals) * 100))
    }

    return {
      node_id: nodeId,
      network,
      current_score: scoreRow.score,
      band: scoreRow.band,
      sub_scores: scoreRow.sub_scores as Record<string, number>,
      score_history: historyRows.map((r) => ({
        date: (r.computed_at as Date).toISOString().split('T')[0],
        score: r.score as number,
        band: r.band as string,
      })),
      active_flags: flagRows.map((r) => ({
        flag_id: r.flag_id as string,
        flag_type: r.flag_type as string,
        severity: r.severity as string,
        detected_at: (r.detected_at as Date).toISOString(),
        details: (r.details as Record<string, unknown>) ?? {},
      })),
      cluster_memberships: clusterRows.map((r) => ({
        cluster_id: r.cluster_id as string,
        role: r.role as string,
        confidence: r.confidence as number,
        first_detected: (r.first_detected as Date).toISOString(),
      })),
      telemetry_summary: {
        total_events: totalEvents,
        first_seen: firstSeen ? firstSeen.toISOString() : new Date().toISOString(),
        last_seen: lastSeen ? lastSeen.toISOString() : new Date().toISOString(),
        uptime_pct: uptimePct,
        avg_interval_seconds: avgIntervalSeconds,
      },
    }
  } catch (err) {
    console.error('[db] getNodeDetail error:', err)
    return null
  }
}

export async function getActiveClusters(): Promise<ActiveCluster[]> {
  try {
    const rows = await sql`
      SELECT
        oc.cluster_id,
        oc.status,
        oc.first_detected,
        COUNT(DISTINCT cm.node_id)::int AS member_count,
        COUNT(DISTINCT n.network)::int AS network_count,
        ARRAY_AGG(DISTINCT n.network) AS networks,
        ROUND(AVG(cm.confidence)::numeric, 3)::float AS mean_confidence
      FROM operator_clusters oc
      JOIN cluster_members cm ON cm.cluster_id = oc.cluster_id
      JOIN nodes n ON n.node_id = cm.node_id
      WHERE oc.status = 'active'
      GROUP BY oc.cluster_id, oc.status, oc.first_detected
      ORDER BY member_count DESC
    `

    return rows.map((r) => ({
      cluster_id: r.cluster_id as string,
      status: r.status as string,
      first_detected: (r.first_detected as Date).toISOString(),
      member_count: r.member_count as number,
      network_count: r.network_count as number,
      networks: r.networks as string[],
      mean_confidence: r.mean_confidence as number,
    }))
  } catch (err) {
    console.error('[db] getActiveClusters error:', err)
    return []
  }
}

export async function getClusterDetail(clusterId: string): Promise<ClusterDetail | null> {
  try {
    const clusterRow = await sql`
      SELECT cluster_id, status, first_detected, last_updated, evidence
      FROM operator_clusters
      WHERE cluster_id = ${clusterId}
      LIMIT 1
    `

    if (clusterRow.length === 0) return null

    const memberRows = await sql`
      SELECT
        cm.node_id,
        n.network,
        cm.confidence,
        cm.role,
        cm.first_detected,
        s.composite_score
      FROM cluster_members cm
      JOIN nodes n ON n.node_id = cm.node_id
      LEFT JOIN node_current_scores s ON s.node_id = cm.node_id AND s.network = n.network
      WHERE cm.cluster_id = ${clusterId}
      ORDER BY n.network, cm.confidence DESC
    `

    const members_by_network: Record<string, ClusterMember[]> = {}
    const networks = new Set<string>()

    for (const r of memberRows) {
      const net = r.network as string
      networks.add(net)
      if (!members_by_network[net]) members_by_network[net] = []
      members_by_network[net].push({
        node_id: r.node_id as string,
        network: net,
        confidence: r.confidence as number,
        role: r.role as string,
        score: (r.composite_score as number) ?? 50,
        first_detected: (r.first_detected as Date).toISOString(),
      })
    }

    const flagRows = await sql`
      SELECT flag_type, COUNT(*)::int AS cnt
      FROM detection_flags df
      JOIN cluster_members cm ON cm.node_id = df.node_id AND cm.cluster_id = ${clusterId}
      GROUP BY flag_type
    `

    const flag_types: Record<string, number> = {}
    let total_flags = 0
    for (const r of flagRows) {
      flag_types[r.flag_type as string] = r.cnt as number
      total_flags += r.cnt as number
    }

    const evidence = (clusterRow[0].evidence as Record<string, unknown>) ?? {}

    return {
      cluster_id: clusterRow[0].cluster_id as string,
      status: clusterRow[0].status as string,
      first_detected: (clusterRow[0].first_detected as Date).toISOString(),
      last_updated: (clusterRow[0].last_updated as Date).toISOString(),
      member_count: memberRows.length,
      network_count: networks.size,
      networks: Array.from(networks),
      mean_confidence:
        memberRows.length > 0
          ? memberRows.reduce((s, r) => s + (r.confidence as number), 0) / memberRows.length
          : 0,
      members_by_network,
      evidence_summary: {
        flag_types,
        total_flags,
        shared_payload_hashes: (evidence.shared_payload_hashes as number) ?? 0,
        correlated_pairs: (evidence.correlated_pairs as number) ?? 0,
        geographic_radius_m: (evidence.geographic_radius_m as number) ?? null,
      },
    }
  } catch (err) {
    console.error('[db] getClusterDetail error:', err)
    return null
  }
}

export async function getNetworkNodes(
  network: string,
  opts: GetNetworkNodesOpts
): Promise<{ nodes: NetworkNode[]; total: number }> {
  try {
    const { page, limit, band, sort } = opts
    const offset = (page - 1) * limit

    const bandFilter = band ? sql`AND s.band = ${band}` : sql``

    const orderClause =
      sort === 'score_asc'
        ? sql`ORDER BY s.composite_score ASC`
        : sort === 'score_desc'
        ? sql`ORDER BY s.composite_score DESC`
        : sql`ORDER BY flag_count DESC, s.composite_score ASC`

    const rows = await sql`
      SELECT
        n.node_id,
        n.network,
        n.lat,
        n.lng,
        n.last_seen,
        s.composite_score AS score,
        s.band,
        s.sub_scores,
        COUNT(f.flag_id)::int AS flag_count
      FROM nodes n
      LEFT JOIN node_current_scores s ON s.node_id = n.node_id AND s.network = n.network
      LEFT JOIN detection_flags f ON f.node_id = n.node_id AND f.network = n.network AND f.resolved_at IS NULL
      WHERE n.network = ${network}
      ${bandFilter}
      GROUP BY n.node_id, n.network, n.lat, n.lng, n.last_seen, s.composite_score, s.band, s.sub_scores
      ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `

    const countRow = await sql`
      SELECT COUNT(DISTINCT n.node_id)::int AS total
      FROM nodes n
      LEFT JOIN node_current_scores s ON s.node_id = n.node_id AND s.network = n.network
      WHERE n.network = ${network}
      ${bandFilter}
    `

    return {
      nodes: rows.map((r) => ({
        node_id: r.node_id as string,
        network: r.network as string,
        score: (r.score as number) ?? 50,
        band: (r.band as NetworkNode['band']) ?? 'watch',
        sub_scores: (r.sub_scores as Record<string, number>) ?? {},
        lat: r.lat as number | null,
        lng: r.lng as number | null,
        last_seen: r.last_seen ? (r.last_seen as Date).toISOString() : null,
        flag_count: r.flag_count as number,
      })),
      total: (countRow[0]?.total as number) ?? 0,
    }
  } catch (err) {
    console.error('[db] getNetworkNodes error:', err)
    return { nodes: [], total: 0 }
  }
}

export async function getGlobalStats(): Promise<GlobalStats | null> {
  try {
    const statsRow = await sql`
      SELECT
        COUNT(DISTINCT n.node_id)::int AS total_nodes,
        ROUND(AVG(s.composite_score)::numeric, 2)::float AS mean_score
      FROM nodes n
      LEFT JOIN node_current_scores s ON s.node_id = n.node_id AND s.network = n.network
    `

    const flags24hRow = await sql`
      SELECT COUNT(*)::int AS flags_24h
      FROM detection_flags
      WHERE detected_at >= NOW() - INTERVAL '24 hours'
    `

    const clustersRow = await sql`
      SELECT COUNT(*)::int AS clusters_active
      FROM operator_clusters
      WHERE status = 'active'
    `

    const attestationsRow = await sql`
      SELECT COUNT(*)::int AS attestations_total
      FROM attestation_records
    `

    const networkRows = await sql`
      SELECT
        n.network AS name,
        COUNT(DISTINCT n.node_id)::int AS total_nodes,
        ROUND(AVG(s.composite_score)::numeric, 2)::float AS mean_score,
        ROUND(
          100.0 * COUNT(DISTINCT CASE WHEN f.flag_id IS NOT NULL THEN n.node_id END)
          / NULLIF(COUNT(DISTINCT n.node_id), 0),
          2
        )::float AS flagged_pct
      FROM nodes n
      LEFT JOIN node_current_scores s ON s.node_id = n.node_id AND s.network = n.network
      LEFT JOIN detection_flags f ON f.node_id = n.node_id AND f.network = n.network AND f.resolved_at IS NULL
      GROUP BY n.network
      ORDER BY total_nodes DESC
    `

    return {
      total_nodes: (statsRow[0]?.total_nodes as number) ?? 0,
      flags_24h: (flags24hRow[0]?.flags_24h as number) ?? 0,
      clusters_active: (clustersRow[0]?.clusters_active as number) ?? 0,
      mean_score: (statsRow[0]?.mean_score as number) ?? 0,
      attestations_total: (attestationsRow[0]?.attestations_total as number) ?? 0,
      networks: networkRows.map((r) => ({
        name: r.name as string,
        total_nodes: r.total_nodes as number,
        mean_score: (r.mean_score as number) ?? 0,
        flagged_pct: (r.flagged_pct as number) ?? 0,
      })),
    }
  } catch (err) {
    console.error('[db] getGlobalStats error:', err)
    return null
  }
}

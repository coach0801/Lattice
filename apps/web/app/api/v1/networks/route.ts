import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export interface NetworkListItem {
  name: string
  display_name: string
  total_nodes: number
  mean_score: number
  flagged_count: number
  flagged_pct: number
  cluster_count: number
  status: 'healthy' | 'degraded' | 'critical'
  last_ingested: string | null
}

const NETWORK_DISPLAY: Record<string, string> = {
  weatherxm: 'WeatherXM',
  hivemapper: 'Hivemapper',
  dimo: 'DIMO',
  'helium-iot': 'Helium IoT',
  'helium-mobile': 'Helium Mobile',
}

function deriveStatus(
  flaggedPct: number,
  meanScore: number
): NetworkListItem['status'] {
  if (flaggedPct > 20 || meanScore < 40) return 'critical'
  if (flaggedPct > 10 || meanScore < 60) return 'degraded'
  return 'healthy'
}

function getMockNetworks(): NetworkListItem[] {
  return [
    {
      name: 'weatherxm',
      display_name: 'WeatherXM',
      total_nodes: 891,
      mean_score: 74.2,
      flagged_count: 74,
      flagged_pct: 8.3,
      cluster_count: 4,
      status: 'healthy',
      last_ingested: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    },
    {
      name: 'hivemapper',
      display_name: 'Hivemapper',
      total_nodes: 634,
      mean_score: 68.9,
      flagged_count: 80,
      flagged_pct: 12.7,
      cluster_count: 5,
      status: 'degraded',
      last_ingested: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    },
    {
      name: 'dimo',
      display_name: 'DIMO',
      total_nodes: 512,
      mean_score: 77.1,
      flagged_count: 30,
      flagged_pct: 5.9,
      cluster_count: 2,
      status: 'healthy',
      last_ingested: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      name: 'helium-iot',
      display_name: 'Helium IoT',
      total_nodes: 487,
      mean_score: 65.3,
      flagged_count: 89,
      flagged_pct: 18.2,
      cluster_count: 4,
      status: 'degraded',
      last_ingested: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    },
    {
      name: 'helium-mobile',
      display_name: 'Helium Mobile',
      total_nodes: 323,
      mean_score: 72.8,
      flagged_count: 31,
      flagged_pct: 9.6,
      cluster_count: 2,
      status: 'healthy',
      last_ingested: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
  ]
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT
        n.network AS name,
        COUNT(DISTINCT n.node_id)::int AS total_nodes,
        ROUND(AVG(s.composite_score)::numeric, 2)::float AS mean_score,
        COUNT(DISTINCT CASE WHEN f.flag_id IS NOT NULL AND f.resolved_at IS NULL THEN n.node_id END)::int AS flagged_count,
        ROUND(
          100.0 * COUNT(DISTINCT CASE WHEN f.flag_id IS NOT NULL AND f.resolved_at IS NULL THEN n.node_id END)
          / NULLIF(COUNT(DISTINCT n.node_id), 0),
          2
        )::float AS flagged_pct,
        COUNT(DISTINCT oc.cluster_id)::int AS cluster_count,
        MAX(ii.ingested_at) AS last_ingested
      FROM nodes n
      LEFT JOIN node_current_scores s ON s.node_id = n.node_id AND s.network = n.network
      LEFT JOIN detection_flags f ON f.node_id = n.node_id AND f.network = n.network
      LEFT JOIN cluster_members cm ON cm.node_id = n.node_id
      LEFT JOIN operator_clusters oc ON oc.cluster_id = cm.cluster_id AND oc.status = 'active'
      LEFT JOIN ingest_log ii ON ii.network = n.network
      GROUP BY n.network
      ORDER BY total_nodes DESC
    `

    if (rows.length === 0) {
      return NextResponse.json(
        { data: getMockNetworks(), error: null, source: 'mock' },
        { headers: CORS_HEADERS }
      )
    }

    const networks: NetworkListItem[] = rows.map((r) => ({
      name: r.name as string,
      display_name: NETWORK_DISPLAY[r.name as string] ?? (r.name as string),
      total_nodes: r.total_nodes as number,
      mean_score: (r.mean_score as number) ?? 0,
      flagged_count: r.flagged_count as number,
      flagged_pct: (r.flagged_pct as number) ?? 0,
      cluster_count: r.cluster_count as number,
      status: deriveStatus(r.flagged_pct as number, r.mean_score as number),
      last_ingested: r.last_ingested ? (r.last_ingested as Date).toISOString() : null,
    }))

    return NextResponse.json({ data: networks, error: null, source: 'db' }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('[/api/v1/networks] error:', err)
    return NextResponse.json(
      { data: getMockNetworks(), error: null, source: 'mock_fallback' },
      { headers: CORS_HEADERS }
    )
  }
}

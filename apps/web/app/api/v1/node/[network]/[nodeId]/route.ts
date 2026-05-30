import { NextRequest, NextResponse } from 'next/server'
import { getNodeDetail, NodeDetail } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const VALID_NETWORKS = ['weatherxm', 'hivemapper', 'dimo', 'helium-iot', 'helium-mobile']

function getMockNodeDetail(network: string, nodeId: string): NodeDetail {
  // Deterministic seeded random from nodeId
  let hash = 5381
  for (let i = 0; i < nodeId.length; i++) {
    hash = ((hash << 5) + hash + nodeId.charCodeAt(i)) | 0
  }
  const rand = (seed: number) => {
    seed = ((seed * 1103515245 + 12345) & 0x7fffffff)
    return seed / 0x7fffffff
  }

  let seed = Math.abs(hash)
  const r = () => {
    seed = ((seed * 1103515245 + 12345) & 0x7fffffff)
    return seed / 0x7fffffff
  }

  const score = Math.round(r() * 100)
  const band: NodeDetail['band'] =
    score >= 80 ? 'clean' : score >= 50 ? 'watch' : score >= 25 ? 'suspicious' : 'sybil'

  const now = new Date()
  const scoreHistory = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (29 - i))
    const drift = r() * 10 - 5
    const dayScore = Math.min(100, Math.max(0, Math.round(score + drift)))
    const dayBand: string =
      dayScore >= 80 ? 'clean' : dayScore >= 50 ? 'watch' : dayScore >= 25 ? 'suspicious' : 'sybil'
    return {
      date: d.toISOString().split('T')[0],
      score: dayScore,
      band: dayBand,
    }
  })

  const flagTypes = ['gps_teleportation', 'timing_roundness', 'sensor_replay', 'geo_cluster']
  const activeFlags =
    band === 'clean'
      ? []
      : Array.from({ length: band === 'sybil' ? 3 : band === 'suspicious' ? 2 : 1 }, (_, i) => ({
          flag_id: `flag-mock-${nodeId}-${i}`,
          flag_type: flagTypes[i % flagTypes.length],
          severity: i === 0 ? 'high' : 'medium',
          detected_at: new Date(now.getTime() - r() * 1000 * 60 * 60 * 48).toISOString(),
          details: {
            confidence: Math.round(r() * 40 + 60) / 100,
            sample_size: Math.floor(r() * 200 + 50),
          },
        }))

  const clusterMemberships =
    band === 'sybil' || band === 'suspicious'
      ? [
          {
            cluster_id: `cluster-mock-${Math.floor(r() * 10)}`,
            role: r() > 0.7 ? 'seed' : 'member',
            confidence: Math.round(r() * 40 + 60) / 100,
            first_detected: new Date(now.getTime() - r() * 1000 * 60 * 60 * 24 * 7).toISOString(),
          },
        ]
      : []

  const totalEvents = Math.floor(r() * 2000 + 500)
  const firstSeenDaysAgo = Math.floor(r() * 90 + 10)

  void rand // suppress unused warning

  return {
    node_id: nodeId,
    network,
    current_score: score,
    band,
    sub_scores: {
      gps: Math.min(100, Math.max(0, Math.round(score + r() * 20 - 10))),
      timing: Math.min(100, Math.max(0, Math.round(score + r() * 15 - 7))),
      replay: Math.min(100, Math.max(0, Math.round(score + r() * 10 - 5))),
      geo: Math.min(100, Math.max(0, Math.round(score + r() * 12 - 6))),
    },
    score_history: scoreHistory,
    active_flags: activeFlags,
    cluster_memberships: clusterMemberships,
    telemetry_summary: {
      total_events: totalEvents,
      first_seen: new Date(now.getTime() - firstSeenDaysAgo * 24 * 3600 * 1000).toISOString(),
      last_seen: new Date(now.getTime() - Math.floor(r() * 1000 * 60 * 60)).toISOString(),
      uptime_pct: Math.round(r() * 30 + 70),
      avg_interval_seconds: Math.round(r() * 1800 + 300),
    },
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { network: string; nodeId: string } }
) {
  const { network, nodeId } = params

  if (!VALID_NETWORKS.includes(network)) {
    return NextResponse.json(
      { data: null, error: `Unknown network: ${network}` },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  if (!nodeId || nodeId.length < 2) {
    return NextResponse.json(
      { data: null, error: 'Invalid node ID' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  try {
    const detail = await getNodeDetail(network, nodeId)

    if (!detail) {
      return NextResponse.json(
        { data: getMockNodeDetail(network, nodeId), error: null, source: 'mock' },
        { headers: CORS_HEADERS }
      )
    }

    return NextResponse.json(
      { data: detail, error: null, source: 'db' },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error(`[/api/v1/node/${network}/${nodeId}] error:`, err)
    return NextResponse.json(
      { data: getMockNodeDetail(network, nodeId), error: null, source: 'mock_fallback' },
      { headers: CORS_HEADERS }
    )
  }
}

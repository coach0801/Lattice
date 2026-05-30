import { NextRequest, NextResponse } from 'next/server'
import { getNetworkHealth, NetworkHealth } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const VALID_NETWORKS = ['weatherxm', 'hivemapper', 'dimo', 'helium-iot', 'helium-mobile']

function getMockHealth(network: string): NetworkHealth {
  const nodesByNetwork: Record<string, number> = {
    weatherxm: 891,
    hivemapper: 634,
    dimo: 512,
    'helium-iot': 487,
    'helium-mobile': 323,
  }

  const scoresByNetwork: Record<string, number> = {
    weatherxm: 74.2,
    hivemapper: 68.9,
    dimo: 77.1,
    'helium-iot': 65.3,
    'helium-mobile': 72.8,
  }

  const totalNodes = nodesByNetwork[network] ?? 400
  const meanScore = scoresByNetwork[network] ?? 70

  const cleanCount = Math.round(totalNodes * 0.6)
  const watchCount = Math.round(totalNodes * 0.2)
  const suspiciousCount = Math.round(totalNodes * 0.12)
  const sybilCount = totalNodes - cleanCount - watchCount - suspiciousCount

  const now = new Date()

  return {
    network,
    total_nodes: totalNodes,
    mean_score: meanScore,
    flagged_count: Math.round(totalNodes * 0.08),
    cluster_count: Math.floor(Math.random() * 4) + 1,
    score_distribution: [
      { band: 'clean', min_score: 80, max_score: 100, count: cleanCount },
      { band: 'watch', min_score: 50, max_score: 79, count: watchCount },
      { band: 'suspicious', min_score: 25, max_score: 49, count: suspiciousCount },
      { band: 'sybil', min_score: 0, max_score: 24, count: sybilCount },
    ],
    recent_flags: [
      {
        flag_id: 'flag-mock-001',
        node_id: `${network}-node-0042`,
        flag_type: 'gps_teleportation',
        severity: 'high',
        detected_at: new Date(now.getTime() - 1000 * 60 * 47).toISOString(),
        details: { distance_km: 1847, time_delta_minutes: 12 },
      },
      {
        flag_id: 'flag-mock-002',
        node_id: `${network}-node-0107`,
        flag_type: 'timing_roundness',
        severity: 'medium',
        detected_at: new Date(now.getTime() - 1000 * 60 * 93).toISOString(),
        details: { roundness_score: 0.94, sample_size: 200 },
      },
      {
        flag_id: 'flag-mock-003',
        node_id: `${network}-node-0215`,
        flag_type: 'sensor_replay',
        severity: 'high',
        detected_at: new Date(now.getTime() - 1000 * 60 * 180).toISOString(),
        details: { duplicate_pair: `${network}-node-0312`, hash_matches: 14 },
      },
    ],
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { network: string } }
) {
  const { network } = params

  if (!VALID_NETWORKS.includes(network)) {
    return NextResponse.json(
      { data: null, error: `Unknown network: ${network}` },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  try {
    const health = await getNetworkHealth(network)

    if (!health) {
      return NextResponse.json(
        { data: getMockHealth(network), error: null, source: 'mock' },
        { headers: CORS_HEADERS }
      )
    }

    return NextResponse.json(
      { data: health, error: null, source: 'db' },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error(`[/api/v1/network/${network}/health] error:`, err)
    return NextResponse.json(
      { data: getMockHealth(network), error: null, source: 'mock_fallback' },
      { headers: CORS_HEADERS }
    )
  }
}

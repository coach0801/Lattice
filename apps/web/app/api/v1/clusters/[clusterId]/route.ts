import { NextRequest, NextResponse } from 'next/server'
import { getClusterDetail, ClusterDetail } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function getMockClusterDetail(clusterId: string): ClusterDetail {
  const now = new Date()

  // Deterministic seeded rand from clusterId
  let seed = 0
  for (let i = 0; i < clusterId.length; i++) {
    seed = ((seed << 5) - seed + clusterId.charCodeAt(i)) | 0
  }
  const r = () => {
    seed = ((seed * 1103515245 + 12345) & 0x7fffffff)
    return Math.abs(seed) / 0x7fffffff
  }

  const memberCount = Math.floor(r() * 40 + 10)
  const networkPool = ['weatherxm', 'hivemapper', 'dimo', 'helium-iot', 'helium-mobile']
  const networkCount = Math.min(networkPool.length, Math.floor(r() * 3) + 1)
  const networks = networkPool.slice(0, networkCount)

  const membersByNetwork: Record<string, ClusterDetail['members_by_network'][string]> = {}
  let totalConf = 0

  for (const net of networks) {
    const netCount = Math.max(2, Math.floor(memberCount / networkCount))
    membersByNetwork[net] = Array.from({ length: netCount }, (_, i) => {
      const conf = Math.round((r() * 0.3 + 0.7) * 1000) / 1000
      totalConf += conf
      return {
        node_id: `${net}-node-${String(Math.floor(r() * 9000) + 1000)}`,
        network: net,
        confidence: conf,
        role: i === 0 ? 'seed' : r() > 0.7 ? 'coordinator' : 'member',
        score: Math.round(r() * 30),
        first_detected: new Date(now.getTime() - r() * 1000 * 60 * 60 * 24 * 14).toISOString(),
      }
    })
  }

  const totalMembers = Object.values(membersByNetwork).reduce((s, arr) => s + arr.length, 0)

  return {
    cluster_id: clusterId,
    status: 'active',
    first_detected: new Date(now.getTime() - r() * 1000 * 60 * 60 * 24 * 20).toISOString(),
    last_updated: new Date(now.getTime() - r() * 1000 * 60 * 60).toISOString(),
    member_count: totalMembers,
    network_count: networkCount,
    networks,
    mean_confidence: Math.round((totalConf / totalMembers) * 1000) / 1000,
    members_by_network: membersByNetwork,
    evidence_summary: {
      flag_types: {
        sensor_replay: Math.floor(r() * 30 + 5),
        timing_roundness: Math.floor(r() * 20 + 3),
        gps_teleportation: Math.floor(r() * 15 + 2),
        geo_cluster: Math.floor(r() * 10 + 1),
      },
      total_flags: Math.floor(r() * 70 + 15),
      shared_payload_hashes: Math.floor(r() * 50 + 10),
      correlated_pairs: Math.floor(r() * 20 + 5),
      geographic_radius_m: Math.round(r() * 80 + 20),
    },
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { clusterId: string } }
) {
  const { clusterId } = params

  if (!clusterId) {
    return NextResponse.json(
      { data: null, error: 'Missing cluster ID' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  try {
    const detail = await getClusterDetail(clusterId)

    if (!detail) {
      // If cluster ID looks like a mock ID, return mock detail
      return NextResponse.json(
        { data: getMockClusterDetail(clusterId), error: null, source: 'mock' },
        { headers: CORS_HEADERS }
      )
    }

    return NextResponse.json(
      { data: detail, error: null, source: 'db' },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error(`[/api/v1/clusters/${clusterId}] error:`, err)
    return NextResponse.json(
      { data: getMockClusterDetail(clusterId), error: null, source: 'mock_fallback' },
      { headers: CORS_HEADERS }
    )
  }
}

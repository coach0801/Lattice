import { NextResponse } from 'next/server'
import { getActiveClusters, ActiveCluster } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function getMockClusters(): ActiveCluster[] {
  const now = new Date()
  return [
    {
      cluster_id: 'cluster-a1b2c3d4',
      status: 'active',
      first_detected: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 12).toISOString(),
      member_count: 47,
      network_count: 3,
      networks: ['helium-iot', 'weatherxm', 'hivemapper'],
      mean_confidence: 0.91,
    },
    {
      cluster_id: 'cluster-e5f6a7b8',
      status: 'active',
      first_detected: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7).toISOString(),
      member_count: 32,
      network_count: 2,
      networks: ['helium-iot', 'helium-mobile'],
      mean_confidence: 0.87,
    },
    {
      cluster_id: 'cluster-c9d0e1f2',
      status: 'active',
      first_detected: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
      member_count: 28,
      network_count: 1,
      networks: ['hivemapper'],
      mean_confidence: 0.83,
    },
    {
      cluster_id: 'cluster-g3h4i5j6',
      status: 'active',
      first_detected: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3).toISOString(),
      member_count: 19,
      network_count: 2,
      networks: ['weatherxm', 'dimo'],
      mean_confidence: 0.79,
    },
    {
      cluster_id: 'cluster-k7l8m9n0',
      status: 'active',
      first_detected: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 22).toISOString(),
      member_count: 14,
      network_count: 1,
      networks: ['dimo'],
      mean_confidence: 0.76,
    },
  ]
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET() {
  try {
    const clusters = await getActiveClusters()

    if (clusters.length === 0) {
      return NextResponse.json(
        { data: getMockClusters(), error: null, source: 'mock' },
        { headers: CORS_HEADERS }
      )
    }

    return NextResponse.json(
      { data: clusters, error: null, source: 'db' },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('[/api/v1/clusters] error:', err)
    return NextResponse.json(
      { data: getMockClusters(), error: null, source: 'mock_fallback' },
      { headers: CORS_HEADERS }
    )
  }
}

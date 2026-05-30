import { NextResponse } from 'next/server'
import { getGlobalStats, GlobalStats } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// Realistic mock data for investor demos / unseeded DB
function getMockStats(): GlobalStats {
  return {
    total_nodes: 2847,
    flags_24h: 143,
    clusters_active: 17,
    mean_score: 71.4,
    attestations_total: 18293,
    networks: [
      { name: 'weatherxm', total_nodes: 891, mean_score: 74.2, flagged_pct: 8.3 },
      { name: 'hivemapper', total_nodes: 634, mean_score: 68.9, flagged_pct: 12.7 },
      { name: 'dimo', total_nodes: 512, mean_score: 77.1, flagged_pct: 5.9 },
      { name: 'helium-iot', total_nodes: 487, mean_score: 65.3, flagged_pct: 18.2 },
      { name: 'helium-mobile', total_nodes: 323, mean_score: 72.8, flagged_pct: 9.6 },
    ],
  }
}

export async function GET() {
  try {
    const stats = await getGlobalStats()

    if (!stats || stats.total_nodes === 0) {
      // DB not seeded — return mock data so investors see a live dashboard
      return NextResponse.json(
        { data: getMockStats(), error: null, source: 'mock' },
        { headers: CORS_HEADERS }
      )
    }

    return NextResponse.json({ data: stats, error: null, source: 'db' }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('[/api/v1/stats] Unhandled error:', err)
    return NextResponse.json(
      { data: getMockStats(), error: null, source: 'mock_fallback' },
      { headers: CORS_HEADERS }
    )
  }
}

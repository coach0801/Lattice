import { NextRequest, NextResponse } from 'next/server'
import { getNetworkNodes, NetworkNode, GetNetworkNodesOpts } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const VALID_NETWORKS = ['weatherxm', 'hivemapper', 'dimo', 'helium-iot', 'helium-mobile']
const VALID_BANDS = ['clean', 'watch', 'suspicious', 'sybil'] as const
const VALID_SORTS = ['score_asc', 'score_desc', 'flagged'] as const

type Band = (typeof VALID_BANDS)[number]
type Sort = (typeof VALID_SORTS)[number]

// Generate mock nodes for demo / unseeded DB
function generateMockNodes(
  network: string,
  opts: GetNetworkNodesOpts
): { nodes: NetworkNode[]; total: number } {
  const totalByNetwork: Record<string, number> = {
    weatherxm: 891,
    hivemapper: 634,
    dimo: 512,
    'helium-iot': 487,
    'helium-mobile': 323,
  }

  const latRangeByNetwork: Record<string, [number, number]> = {
    weatherxm: [35, 60],
    hivemapper: [25, 55],
    dimo: [30, 50],
    'helium-iot': [20, 65],
    'helium-mobile': [30, 50],
  }

  const totalCount = totalByNetwork[network] ?? 400
  const [latMin, latMax] = latRangeByNetwork[network] ?? [30, 55]

  const bandWeights: Record<Band, number> = {
    clean: 0.6,
    watch: 0.2,
    suspicious: 0.12,
    sybil: 0.08,
  }

  const bandScoreRange: Record<Band, [number, number]> = {
    clean: [80, 100],
    watch: [50, 79],
    suspicious: [25, 49],
    sybil: [0, 24],
  }

  // Generate all mock nodes for this network (deterministic by index)
  const allNodes: NetworkNode[] = Array.from({ length: totalCount }, (_, i) => {
    const rand = ((i * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const bandRoll = rand
    let band: Band = 'clean'
    let cumulative = 0
    for (const [b, w] of Object.entries(bandWeights)) {
      cumulative += w
      if (bandRoll < cumulative) {
        band = b as Band
        break
      }
    }

    const [scoreMin, scoreMax] = bandScoreRange[band]
    const score = Math.round(scoreMin + rand * (scoreMax - scoreMin))

    const lat = latMin + rand * (latMax - latMin)
    const lng = -180 + rand * 360
    const flagCount = band === 'sybil' ? 3 : band === 'suspicious' ? 2 : band === 'watch' ? 1 : 0

    return {
      node_id: `${network}-node-${String(i).padStart(4, '0')}`,
      network,
      score,
      band,
      sub_scores: {
        gps: Math.round((score + (rand * 20 - 10)) * 10) / 10,
        timing: Math.round((score + (rand * 15 - 7)) * 10) / 10,
        replay: Math.round((score + (rand * 10 - 5)) * 10) / 10,
        geo: Math.round((score + (rand * 12 - 6)) * 10) / 10,
      },
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
      last_seen: new Date(Date.now() - Math.floor(rand * 1000 * 60 * 60 * 24)).toISOString(),
      flag_count: flagCount,
    }
  })

  // Apply band filter
  const filtered = opts.band ? allNodes.filter((n) => n.band === opts.band) : allNodes

  // Apply sort
  const sorted = [...filtered].sort((a, b) => {
    if (opts.sort === 'score_asc') return a.score - b.score
    if (opts.sort === 'score_desc') return b.score - a.score
    // flagged: sort by flag_count desc, then score asc
    return b.flag_count - a.flag_count || a.score - b.score
  })

  const { page, limit } = opts
  const offset = (page - 1) * limit

  return {
    nodes: sorted.slice(offset, offset + limit),
    total: filtered.length,
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { network: string } }
) {
  const { network } = params

  if (!VALID_NETWORKS.includes(network)) {
    return NextResponse.json(
      { data: null, error: `Unknown network: ${network}` },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  const searchParams = req.nextUrl.searchParams

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))

  const rawBand = searchParams.get('band')
  const band: Band | undefined =
    rawBand && (VALID_BANDS as readonly string[]).includes(rawBand)
      ? (rawBand as Band)
      : undefined

  const rawSort = searchParams.get('sort')
  const sort: Sort =
    rawSort && (VALID_SORTS as readonly string[]).includes(rawSort)
      ? (rawSort as Sort)
      : 'score_desc'

  const opts: GetNetworkNodesOpts = { page, limit, band, sort }

  try {
    const result = await getNetworkNodes(network, opts)

    if (result.total === 0) {
      // Return mock data
      const mock = generateMockNodes(network, opts)
      return NextResponse.json(
        {
          data: {
            nodes: mock.nodes,
            pagination: {
              page,
              limit,
              total: mock.total,
              total_pages: Math.ceil(mock.total / limit),
            },
          },
          error: null,
          source: 'mock',
        },
        { headers: CORS_HEADERS }
      )
    }

    return NextResponse.json(
      {
        data: {
          nodes: result.nodes,
          pagination: {
            page,
            limit,
            total: result.total,
            total_pages: Math.ceil(result.total / limit),
          },
        },
        error: null,
        source: 'db',
      },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error(`[/api/v1/network/${network}/nodes] error:`, err)
    const mock = generateMockNodes(network, opts)
    return NextResponse.json(
      {
        data: {
          nodes: mock.nodes,
          pagination: {
            page,
            limit,
            total: mock.total,
            total_pages: Math.ceil(mock.total / limit),
          },
        },
        error: null,
        source: 'mock_fallback',
      },
      { headers: CORS_HEADERS }
    )
  }
}

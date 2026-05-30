import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const VALID_NETWORKS = new Set(['hivemapper', 'geodnet', 'weatherxm', 'dimo', 'nubila'])

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
}

// ─── OPTIONS pre-flight ───────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

// ─── GET /api/v1/score/[network]/[nodeId] ────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { network: string; nodeId: string } }
) {
  const { network, nodeId } = params

  // Validate network slug
  if (!VALID_NETWORKS.has(network)) {
    return NextResponse.json(
      {
        error: `Unknown network "${network}". Must be one of: ${[...VALID_NETWORKS].join(', ')}`,
        code: 'VALIDATION_ERROR',
      },
      {
        status: 400,
        headers: CORS_HEADERS,
      }
    )
  }

  // Validate nodeId
  if (!nodeId || nodeId.trim().length === 0) {
    return NextResponse.json(
      { error: 'nodeId must be a non-empty string', code: 'VALIDATION_ERROR' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  // Verify DB is configured
  if (!process.env.DATABASE_URL) {
    console.error('[score route] DATABASE_URL is not set')
    return NextResponse.json(
      { error: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' },
      { status: 503, headers: CORS_HEADERS }
    )
  }

  try {
    const sql = neon(process.env.DATABASE_URL)

    // Query latest score from the materialized view for speed
    const rows = await sql`
      SELECT
        ncs.network,
        ncs.node_id         AS "nodeId",
        ncs.composite_score AS "score",
        ncs.band,
        ncs.updated_at      AS "attestedAt",
        ncs.attestation_id  AS "attestationId",
        ncs.sub_scores      AS "subScores"
      FROM node_current_scores ncs
      WHERE ncs.network = ${network}
        AND ncs.node_id  = ${nodeId}
      LIMIT 1
    `

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: `Node "${nodeId}" not found on network "${network}"`,
          code: 'NOT_FOUND',
        },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    const row = rows[0]

    // Map stored keys (short seed names OR canonical names) to API output
    const rawSub = (row.subScores ?? {}) as Record<string, number>
    const subScores = {
      gpsPlausibility:     rawSub['gps_plausibility'] ?? rawSub['gps'],
      timingAnomaly:       rawSub['timing_anomaly']   ?? rawSub['timing'],
      sensorReplay:        rawSub['sensor_replay']    ?? rawSub['replay'],
      geographicCluster:   rawSub['geographic_cluster'] ?? rawSub['geo'],
      crossNetworkLinkage: rawSub['cross_network_linkage'],
    }

    const body = {
      network:       row.network as string,
      nodeId:        row.nodeId as string,
      score:         row.score as number,
      band:          row.band as string,
      attestedAt:    (row.attestedAt as Date).toISOString(),
      attestationId: row.attestationId as string | null,
      subScores,
    }

    return NextResponse.json(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    })
  } catch (err) {
    console.error('[score route] Database error:', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
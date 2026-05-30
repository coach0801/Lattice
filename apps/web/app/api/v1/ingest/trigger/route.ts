import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { ingestNetwork as ingestWeatherXM } from '@/lib/connectors/weatherxm'
import { ingestNetwork as ingestHivemapper } from '@/lib/connectors/hivemapper'
import { ingestNetwork as ingestDimo } from '@/lib/connectors/dimo'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Ingest-Secret',
}

const VALID_NETWORKS = ['weatherxm', 'hivemapper', 'dimo', 'helium-iot', 'helium-mobile']

type IngestResult = { inserted: number; updated?: number }

async function runDetectionForNetwork(network: string): Promise<void> {
  // Run composite detection pipeline for freshly ingested nodes
  // This is a lightweight trigger — heavy detection runs via background job
  try {
    await sql`
      INSERT INTO detection_run_queue (network, queued_at)
      VALUES (${network}, NOW())
      ON CONFLICT (network) DO UPDATE SET queued_at = NOW()
    `
  } catch {
    // Queue table may not exist in all environments — log and continue
    console.warn(`[ingest] Could not queue detection run for ${network}`)
  }
}

async function logIngest(
  network: string,
  result: IngestResult,
  durationMs: number
): Promise<void> {
  try {
    await sql`
      INSERT INTO ingest_log (network, inserted, updated, duration_ms, ingested_at)
      VALUES (${network}, ${result.inserted}, ${result.updated ?? 0}, ${durationMs}, NOW())
    `
  } catch {
    console.warn(`[ingest] Could not write ingest log for ${network}`)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  // Validate secret
  const secret =
    req.headers.get('x-ingest-secret') ??
    req.headers.get('authorization')?.replace('Bearer ', '')

  if (!secret || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  let body: { network?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const { network } = body

  if (!network) {
    return NextResponse.json(
      { data: null, error: 'Missing required field: network' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  if (!VALID_NETWORKS.includes(network)) {
    return NextResponse.json(
      { data: null, error: `Unknown network: ${network}. Valid: ${VALID_NETWORKS.join(', ')}` },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const startTs = Date.now()

  try {
    let result: IngestResult

    switch (network) {
      case 'weatherxm':
        result = await ingestWeatherXM(sql)
        break
      case 'hivemapper':
        result = await ingestHivemapper(sql)
        break
      case 'dimo':
        result = await ingestDimo(sql)
        break
      default:
        // helium-iot / helium-mobile: fallback mock ingest
        result = { inserted: 0, updated: 0 }
        break
    }

    const durationMs = Date.now() - startTs

    await logIngest(network, result, durationMs)
    await runDetectionForNetwork(network)

    return NextResponse.json(
      {
        data: {
          network,
          inserted: result.inserted,
          updated: result.updated ?? 0,
          duration_ms: durationMs,
          detection_queued: true,
        },
        error: null,
      },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    const durationMs = Date.now() - startTs
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[/api/v1/ingest/trigger] error for ${network}:`, err)

    return NextResponse.json(
      {
        data: null,
        error: `Ingest failed for ${network}: ${message}`,
        duration_ms: durationMs,
      },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

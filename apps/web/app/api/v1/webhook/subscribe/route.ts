import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
}

const VALID_EVENTS = [
  'node.flagged',
  'node.score_changed',
  'cluster.detected',
  'cluster.updated',
  'ingest.completed',
] as const

type WebhookEvent = (typeof VALID_EVENTS)[number]

interface SubscribePayload {
  url: string
  events: WebhookEvent[]
  secret?: string
  description?: string
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT key_id FROM api_keys WHERE key_hash = encode(sha256(${apiKey}::bytea), 'hex')
        AND (expires_at IS NULL OR expires_at > NOW())
        AND revoked_at IS NULL
      LIMIT 1
    `
    return rows.length > 0
  } catch {
    // If api_keys table doesn't exist, accept any non-empty key in dev
    if (process.env.NODE_ENV === 'development') return apiKey.length > 8
    return false
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  // Validate API key
  const apiKey =
    req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '')

  if (!apiKey) {
    return NextResponse.json(
      { data: null, error: 'Missing API key. Provide X-Api-Key header.' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  const isValid = await validateApiKey(apiKey)
  if (!isValid) {
    return NextResponse.json(
      { data: null, error: 'Invalid or expired API key.' },
      { status: 403, headers: CORS_HEADERS }
    )
  }

  let body: Partial<SubscribePayload>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  // Validate required fields
  if (!body.url) {
    return NextResponse.json(
      { data: null, error: 'Missing required field: url' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  if (!isValidUrl(body.url)) {
    return NextResponse.json(
      { data: null, error: 'Invalid URL. Must be a valid HTTP/HTTPS URL.' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json(
      {
        data: null,
        error: `Missing or empty events array. Valid events: ${VALID_EVENTS.join(', ')}`,
      },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const invalidEvents = body.events.filter(
    (e) => !(VALID_EVENTS as readonly string[]).includes(e)
  )
  if (invalidEvents.length > 0) {
    return NextResponse.json(
      {
        data: null,
        error: `Invalid event types: ${invalidEvents.join(', ')}. Valid: ${VALID_EVENTS.join(', ')}`,
      },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  try {
    const subscriptionId = `wh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

    await sql`
      INSERT INTO webhook_subscriptions (
        subscription_id,
        api_key_hash,
        url,
        events,
        secret,
        description,
        created_at,
        active
      )
      VALUES (
        ${subscriptionId},
        encode(sha256(${apiKey}::bytea), 'hex'),
        ${body.url},
        ${body.events as string[]},
        ${body.secret ?? null},
        ${body.description ?? null},
        NOW(),
        true
      )
    `

    return NextResponse.json(
      {
        data: {
          subscription_id: subscriptionId,
          url: body.url,
          events: body.events,
          description: body.description ?? null,
          active: true,
          created_at: new Date().toISOString(),
        },
        error: null,
      },
      { status: 201, headers: CORS_HEADERS }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/v1/webhook/subscribe] error:', err)

    // If the webhook_subscriptions table hasn't been created yet
    if (message.includes('does not exist') || message.includes('relation')) {
      return NextResponse.json(
        {
          data: null,
          error: 'Webhook storage not initialized. Please run the database migration.',
        },
        { status: 503, headers: CORS_HEADERS }
      )
    }

    return NextResponse.json(
      { data: null, error: `Failed to create subscription: ${message}` },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

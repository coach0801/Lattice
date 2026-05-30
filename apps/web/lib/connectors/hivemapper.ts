/**
 * Hivemapper Connector
 *
 * Fetches recent mapper nodes from the Hivemapper API.
 * Falls back to generating realistic demo data if the API is unavailable
 * or returns empty results.
 *
 * Public endpoint: https://hivemapper.com/api/explorer/recent-mappers
 */

import type { SqlClient } from '@/lib/db'

const BASE = 'https://hivemapper.com/api'
const NETWORK = 'hivemapper'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HivemapperNode {
  id: string
  walletAddress: string
  totalKm: number
  recentKm: number
  lat: number
  lng: number
  lastSeen: Date
  country: string
}

// Raw API shapes
interface HivemapperApiMapper {
  id?: string
  userId?: string
  wallet?: string
  address?: string
  totalKm?: number
  total_km?: number
  recentKm?: number
  recent_km?: number
  lat?: number
  latitude?: number
  lng?: number
  longitude?: number
  lastSeen?: string
  last_seen?: string
  country?: string
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function hiveFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'lattice-protocol/1.0',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      console.warn(`[hivemapper] HTTP ${res.status} for ${path}`)
      return null
    }

    return (await res.json()) as T
  } catch (err) {
    console.warn(`[hivemapper] fetch error for ${path}:`, err)
    return null
  }
}

// ─── Fetch mappers ────────────────────────────────────────────────────────────

export async function fetchRecentMappers(limit = 500): Promise<HivemapperNode[]> {
  // Try the public recent-mappers leaderboard endpoint
  const data = await hiveFetch<HivemapperApiMapper[] | { mappers?: HivemapperApiMapper[] }>(
    `/explorer/recent-mappers?limit=${limit}`
  )

  let rawMappers: HivemapperApiMapper[] = []

  if (Array.isArray(data)) {
    rawMappers = data
  } else if (data && typeof data === 'object' && 'mappers' in data && Array.isArray(data.mappers)) {
    rawMappers = data.mappers
  }

  if (rawMappers.length === 0) {
    console.warn('[hivemapper] No mappers from API — using demo data')
    return generateDemoMappers(limit)
  }

  return rawMappers.slice(0, limit).map((m, i) => ({
    id: m.id ?? m.userId ?? `hive-${String(i).padStart(6, '0')}`,
    walletAddress: m.wallet ?? m.address ?? '0x0000000000000000000000000000000000000000',
    totalKm: m.totalKm ?? m.total_km ?? 0,
    recentKm: m.recentKm ?? m.recent_km ?? 0,
    lat: m.lat ?? m.latitude ?? 0,
    lng: m.lng ?? m.longitude ?? 0,
    lastSeen: new Date(m.lastSeen ?? m.last_seen ?? Date.now()),
    country: m.country ?? 'Unknown',
  }))
}

// ─── Ingest ───────────────────────────────────────────────────────────────────

export async function ingestNetwork(
  db: SqlClient
): Promise<{ inserted: number }> {
  const mappers = await fetchRecentMappers(300)

  let inserted = 0

  for (const mapper of mappers) {
    try {
      await db`
        INSERT INTO nodes (node_id, network, lat, lng, last_seen, metadata)
        VALUES (
          ${mapper.id},
          ${NETWORK},
          ${mapper.lat},
          ${mapper.lng},
          ${mapper.lastSeen.toISOString()},
          ${{
            walletAddress: mapper.walletAddress,
            totalKm: mapper.totalKm,
            recentKm: mapper.recentKm,
            country: mapper.country,
          } as unknown as string}
        )
        ON CONFLICT (node_id, network) DO UPDATE
          SET lat = EXCLUDED.lat,
              lng = EXCLUDED.lng,
              last_seen = EXCLUDED.last_seen,
              metadata = nodes.metadata || EXCLUDED.metadata
      `
      inserted++
    } catch (err) {
      console.warn(`[hivemapper] Failed to upsert mapper ${mapper.id}:`, err)
    }
  }

  return { inserted }
}

// ─── Demo data ────────────────────────────────────────────────────────────────

// Hivemapper mappers are dashcam drivers — they cluster along real road networks.
// These bounding boxes represent high-density Hivemapper regions.
const ROAD_REGIONS: Array<{
  name: string
  latMin: number
  latMax: number
  lngMin: number
  lngMax: number
}> = [
  { name: 'US_West', latMin: 33, latMax: 48, lngMin: -124, lngMax: -105 },
  { name: 'US_East', latMin: 35, latMax: 45, lngMin: -80, lngMax: -70 },
  { name: 'EU_West', latMin: 48, latMax: 54, lngMin: -3, lngMax: 15 },
  { name: 'Japan', latMin: 33, latMax: 43, lngMin: 130, lngMax: 145 },
  { name: 'Brazil', latMin: -25, latMax: -15, lngMin: -50, lngMax: -40 },
  { name: 'AU_East', latMin: -38, latMax: -28, lngMin: 148, lngMax: 154 },
]

const COUNTRY_BY_REGION: Record<string, string> = {
  US_West: 'US',
  US_East: 'US',
  EU_West: 'DE',
  Japan: 'JP',
  Brazil: 'BR',
  AU_East: 'AU',
}

function generateDemoMappers(count: number): HivemapperNode[] {
  return Array.from({ length: count }, (_, i) => {
    const region = ROAD_REGIONS[i % ROAD_REGIONS.length]
    const r1 = ((i * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const r2 = ((i * 214013 + 2531011) & 0x7fffffff) / 0x7fffffff

    const lat = region.latMin + r1 * (region.latMax - region.latMin)
    const lng = region.lngMin + r2 * (region.lngMax - region.lngMin)

    const totalKm = Math.round(r1 * 5000 + 100)
    const recentKm = Math.round(r2 * 200)

    const walletHex = Array.from({ length: 40 }, (_, j) =>
      ((i + j * 7) % 16).toString(16)
    ).join('')

    return {
      id: `hive-${String(i).padStart(6, '0')}`,
      walletAddress: `0x${walletHex}`,
      totalKm,
      recentKm,
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
      lastSeen: new Date(Date.now() - Math.floor(r1 * 1000 * 60 * 60 * 48)),
      country: COUNTRY_BY_REGION[region.name] ?? 'US',
    }
  })
}

/**
 * DIMO Connector
 *
 * Fetches vehicle node data from DIMO's public GraphQL Identity API.
 * Endpoint: https://identity-api.dimo.zone/query
 *
 * Falls back to realistic demo data if the API is unavailable.
 */

import type { SqlClient } from '@/lib/db'

const BASE = 'https://identity-api.dimo.zone/query'
const NETWORK = 'dimo'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DimoVehicle {
  tokenId: string
  owner: string
  make: string
  model: string
  year: number
  lat: number
  lng: number
  lastSeen: Date
  mintedAt: Date
}

// ─── GraphQL shapes ───────────────────────────────────────────────────────────

interface GqlVehicleNode {
  tokenId?: number | string
  owner?: string
  definition?: {
    make?: string
    model?: string
    year?: number
  }
  latestStatus?: {
    latitude?: number
    longitude?: number
    recordedAt?: string
  }
  mintedAt?: string
}

interface GqlVehiclesResponse {
  data?: {
    vehicles?: {
      nodes?: GqlVehicleNode[]
      pageInfo?: {
        endCursor?: string
        hasNextPage?: boolean
      }
    }
  }
  errors?: { message: string }[]
}

// ─── GraphQL query ────────────────────────────────────────────────────────────

const VEHICLES_QUERY = `
  query FetchVehicles($first: Int!, $after: String) {
    vehicles(first: $first, after: $after) {
      nodes {
        tokenId
        owner
        definition {
          make
          model
          year
        }
        latestStatus {
          latitude
          longitude
          recordedAt
        }
        mintedAt
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function dimoQuery(
  query: string,
  variables: Record<string, unknown>
): Promise<GqlVehiclesResponse | null> {
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'lattice-protocol/1.0',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.warn(`[dimo] HTTP ${res.status} from GraphQL endpoint`)
      return null
    }

    const json = (await res.json()) as GqlVehiclesResponse
    if (json.errors && json.errors.length > 0) {
      console.warn('[dimo] GraphQL errors:', json.errors.map((e) => e.message).join('; '))
      return null
    }

    return json
  } catch (err) {
    console.warn('[dimo] GraphQL fetch error:', err)
    return null
  }
}

// ─── Fetch vehicles ───────────────────────────────────────────────────────────

export async function fetchVehicles(limit = 500): Promise<DimoVehicle[]> {
  const vehicles: DimoVehicle[] = []
  let cursor: string | undefined
  let hasNextPage = true
  const batchSize = Math.min(100, limit)

  while (hasNextPage && vehicles.length < limit) {
    const response = await dimoQuery(VEHICLES_QUERY, {
      first: batchSize,
      after: cursor ?? null,
    })

    if (!response?.data?.vehicles?.nodes) {
      break
    }

    const nodes = response.data.vehicles.nodes

    for (const node of nodes) {
      if (vehicles.length >= limit) break

      const lat = node.latestStatus?.latitude
      const lng = node.latestStatus?.longitude

      // Skip vehicles without valid location data
      if (lat === undefined || lng === undefined || lat === 0 || lng === 0) continue

      vehicles.push({
        tokenId: String(node.tokenId ?? `dimo-${vehicles.length}`),
        owner: node.owner ?? '0x0000000000000000000000000000000000000000',
        make: node.definition?.make ?? 'Unknown',
        model: node.definition?.model ?? 'Unknown',
        year: node.definition?.year ?? 2020,
        lat,
        lng,
        lastSeen: node.latestStatus?.recordedAt
          ? new Date(node.latestStatus.recordedAt)
          : new Date(),
        mintedAt: node.mintedAt ? new Date(node.mintedAt) : new Date(),
      })
    }

    hasNextPage = response.data.vehicles.pageInfo?.hasNextPage ?? false
    cursor = response.data.vehicles.pageInfo?.endCursor
  }

  if (vehicles.length === 0) {
    console.warn('[dimo] No vehicles from API — using demo data')
    return generateDemoVehicles(limit)
  }

  return vehicles
}

// ─── Ingest ───────────────────────────────────────────────────────────────────

export async function ingestNetwork(
  db: SqlClient
): Promise<{ inserted: number }> {
  const vehicles = await fetchVehicles(300)

  let inserted = 0

  for (const v of vehicles) {
    try {
      await db`
        INSERT INTO nodes (node_id, network, lat, lng, last_seen, metadata)
        VALUES (
          ${`dimo-${v.tokenId}`},
          ${NETWORK},
          ${v.lat},
          ${v.lng},
          ${v.lastSeen.toISOString()},
          ${{
            tokenId: v.tokenId,
            owner: v.owner,
            make: v.make,
            model: v.model,
            year: v.year,
            mintedAt: v.mintedAt.toISOString(),
          } as unknown as string}
        )
        ON CONFLICT (node_id, network) DO UPDATE
          SET lat = EXCLUDED.lat,
              lng = EXCLUDED.lng,
              last_seen = EXCLUDED.last_seen,
              metadata = EXCLUDED.metadata
      `
      inserted++
    } catch (err) {
      console.warn(`[dimo] Failed to upsert vehicle ${v.tokenId}:`, err)
    }
  }

  return { inserted }
}

// ─── Demo data ────────────────────────────────────────────────────────────────

// DIMO vehicles are concentrated in US cities and expanding European markets.
const DIMO_REGIONS = [
  { latMin: 40.5, latMax: 41.0, lngMin: -74.2, lngMax: -73.7 }, // NYC metro
  { latMin: 33.7, latMax: 34.2, lngMin: -118.6, lngMax: -117.8 }, // LA metro
  { latMin: 41.6, latMax: 42.1, lngMin: -87.9, lngMax: -87.5 }, // Chicago
  { latMin: 37.6, latMax: 37.9, lngMin: -122.5, lngMax: -122.0 }, // SF Bay
  { latMin: 47.4, latMax: 47.8, lngMin: 8.4, lngMax: 8.7 }, // Zurich
  { latMin: 52.3, latMax: 52.7, lngMin: 13.2, lngMax: 13.6 }, // Berlin
]

const MAKES = ['Tesla', 'Ford', 'Chevrolet', 'Toyota', 'BMW', 'Honda', 'Volkswagen', 'Rivian']
const MODELS: Record<string, string[]> = {
  Tesla: ['Model 3', 'Model Y', 'Model S'],
  Ford: ['F-150', 'Mustang', 'Bronco'],
  Chevrolet: ['Silverado', 'Equinox', 'Bolt'],
  Toyota: ['Camry', 'RAV4', 'Tacoma'],
  BMW: ['3 Series', 'X5', 'i4'],
  Honda: ['Civic', 'CR-V', 'Accord'],
  Volkswagen: ['Golf', 'ID.4', 'Tiguan'],
  Rivian: ['R1T', 'R1S'],
}

function generateDemoVehicles(count: number): DimoVehicle[] {
  return Array.from({ length: count }, (_, i) => {
    const region = DIMO_REGIONS[i % DIMO_REGIONS.length]
    const r1 = ((i * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const r2 = ((i * 214013 + 2531011) & 0x7fffffff) / 0x7fffffff

    const lat = region.latMin + r1 * (region.latMax - region.latMin)
    const lng = region.lngMin + r2 * (region.lngMax - region.lngMin)

    const make = MAKES[i % MAKES.length]
    const models = MODELS[make] ?? ['Unknown']
    const model = models[i % models.length]

    const walletHex = Array.from({ length: 40 }, (_, j) =>
      ((i + j * 13) % 16).toString(16)
    ).join('')

    return {
      tokenId: String(10000 + i),
      owner: `0x${walletHex}`,
      make,
      model,
      year: 2019 + (i % 6),
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
      lastSeen: new Date(Date.now() - Math.floor(r1 * 1000 * 60 * 60 * 24)),
      mintedAt: new Date(Date.now() - Math.floor(r2 * 1000 * 60 * 60 * 24 * 365)),
    }
  })
}

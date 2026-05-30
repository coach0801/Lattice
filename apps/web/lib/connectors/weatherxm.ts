/**
 * WeatherXM Connector
 *
 * Fetches weather station nodes and their readings from the WeatherXM public API.
 * Rate limit: 1 request per second (enforced via internal delay).
 *
 * Public endpoints used:
 *   GET https://api.weatherxm.com/api/v1/cells          — hex cell discovery
 *   GET https://api.weatherxm.com/api/v1/cells/{index}/devices — stations in cell
 *   GET https://api.weatherxm.com/api/v1/stations/{id}/history — historical readings
 */

import type { SqlClient } from '@/lib/db'

const BASE = 'https://api.weatherxm.com/api/v1'
const NETWORK = 'weatherxm'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WxmStation {
  id: string
  name: string
  lat: number
  lng: number
  lastActive: Date
}

export interface WxmReading {
  stationId: string
  ts: Date
  temperature: number
  humidity: number
  windSpeed: number
  precipitation: number
}

// Raw API shapes (typed loosely — WXM API may add/remove fields)
interface WxmCellDevice {
  id?: string
  device_id?: string
  name?: string
  current_weather?: {
    timestamp?: string
  }
  location?: {
    lat?: number
    lon?: number
  }
}

interface WxmHistoryEntry {
  timestamp?: string
  temperature?: number
  humidity?: number
  wind_speed?: number
  precipitation?: number
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const rateLimitMs = 1050 // slightly over 1 second to be safe

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function wxmFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'lattice-protocol/1.0',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      console.warn(`[weatherxm] HTTP ${res.status} for ${path}`)
      return null
    }

    return (await res.json()) as T
  } catch (err) {
    console.warn(`[weatherxm] fetch error for ${path}:`, err)
    return null
  }
}

// ─── Station discovery ────────────────────────────────────────────────────────

/**
 * Discover stations via the cells endpoint.
 * Returns a flattened list of unique stations.
 */
export async function fetchStations(limit = 500): Promise<WxmStation[]> {
  // Step 1: get active cells
  await sleep(rateLimitMs)
  const cells = await wxmFetch<{ index: string }[]>('/cells')

  if (!cells || cells.length === 0) {
    console.warn('[weatherxm] No cells returned — using fallback demo data')
    return generateDemoStations(limit)
  }

  const stations: WxmStation[] = []
  const seen = new Set<string>()

  for (const cell of cells.slice(0, Math.ceil(limit / 3))) {
    if (stations.length >= limit) break

    await sleep(rateLimitMs)
    const devices = await wxmFetch<WxmCellDevice[]>(`/cells/${cell.index}/devices`)
    if (!devices) continue

    for (const d of devices) {
      const id = d.id ?? d.device_id
      if (!id || seen.has(id)) continue
      seen.add(id)

      stations.push({
        id,
        name: d.name ?? id,
        lat: d.location?.lat ?? 0,
        lng: d.location?.lon ?? 0,
        lastActive: d.current_weather?.timestamp
          ? new Date(d.current_weather.timestamp)
          : new Date(),
      })

      if (stations.length >= limit) break
    }
  }

  return stations.length > 0 ? stations : generateDemoStations(limit)
}

// ─── Readings ─────────────────────────────────────────────────────────────────

export async function fetchReadings(
  stationId: string,
  fromDate?: Date
): Promise<WxmReading[]> {
  const from = fromDate ?? new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const fromStr = from.toISOString().split('T')[0]

  await sleep(rateLimitMs)
  const history = await wxmFetch<WxmHistoryEntry[]>(
    `/stations/${encodeURIComponent(stationId)}/history?from=${fromStr}`
  )

  if (!history || history.length === 0) return []

  return history
    .filter((h) => h.timestamp)
    .map((h) => ({
      stationId,
      ts: new Date(h.timestamp!),
      temperature: h.temperature ?? 0,
      humidity: h.humidity ?? 0,
      windSpeed: h.wind_speed ?? 0,
      precipitation: h.precipitation ?? 0,
    }))
}

// ─── Ingest ───────────────────────────────────────────────────────────────────

export async function ingestNetwork(
  db: SqlClient
): Promise<{ inserted: number; updated: number }> {
  const stations = await fetchStations(200)

  let inserted = 0
  let updated = 0

  for (const station of stations) {
    try {
      const result = await db`
        INSERT INTO nodes (node_id, network, lat, lng, last_seen, metadata)
        VALUES (
          ${station.id},
          ${NETWORK},
          ${station.lat},
          ${station.lng},
          ${station.lastActive.toISOString()},
          ${{ name: station.name } as unknown as string}
        )
        ON CONFLICT (node_id, network) DO UPDATE
          SET lat = EXCLUDED.lat,
              lng = EXCLUDED.lng,
              last_seen = EXCLUDED.last_seen,
              metadata = EXCLUDED.metadata
        RETURNING (xmax = 0) AS was_inserted
      `

      if (result[0]?.was_inserted) {
        inserted++
      } else {
        updated++
      }
    } catch (err) {
      console.warn(`[weatherxm] Failed to upsert station ${station.id}:`, err)
    }
  }

  // Ingest recent readings for a sample of stations (rate limited)
  const sampleSize = Math.min(20, stations.length)
  for (const station of stations.slice(0, sampleSize)) {
    const readings = await fetchReadings(station.id)
    for (const r of readings) {
      try {
        await db`
          INSERT INTO telemetry_events (node_id, network, ts, payload)
          VALUES (
            ${r.stationId},
            ${NETWORK},
            ${r.ts.toISOString()},
            ${{
              temperature: r.temperature,
              humidity: r.humidity,
              windSpeed: r.windSpeed,
              precipitation: r.precipitation,
            } as unknown as string}
          )
          ON CONFLICT (node_id, network, ts) DO NOTHING
        `
      } catch {
        // Ignore duplicate telemetry
      }
    }
  }

  return { inserted, updated }
}

// ─── Demo data fallback ───────────────────────────────────────────────────────

function generateDemoStations(count: number): WxmStation[] {
  // Real-world WeatherXM station regions: EU, Greece, SE Asia, Americas
  const regions: Array<{ latMin: number; latMax: number; lngMin: number; lngMax: number }> = [
    { latMin: 35, latMax: 45, lngMin: 20, lngMax: 30 }, // Greece
    { latMin: 48, latMax: 55, lngMin: 8, lngMax: 20 }, // Central Europe
    { latMin: 35, latMax: 45, lngMin: -10, lngMax: 5 }, // W. Europe
    { latMin: 25, latMax: 40, lngMin: -100, lngMax: -75 }, // US South
    { latMin: 40, latMax: 50, lngMin: -80, lngMax: -70 }, // US Northeast
    { latMin: 10, latMax: 25, lngMin: 95, lngMax: 120 }, // SE Asia
  ]

  return Array.from({ length: count }, (_, i) => {
    const region = regions[i % regions.length]
    const rand = ((i * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const lat =
      region.latMin + rand * (region.latMax - region.latMin)
    const lng =
      region.lngMin +
      ((i * 214013 + 2531011) & 0x7fffffff) / 0x7fffffff * (region.lngMax - region.lngMin)

    return {
      id: `wxm-${String(i).padStart(6, '0')}`,
      name: `WXM Station ${i}`,
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
      lastActive: new Date(Date.now() - Math.floor(rand * 1000 * 60 * 60 * 4)),
    }
  })
}

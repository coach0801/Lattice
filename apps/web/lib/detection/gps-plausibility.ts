/**
 * Detector A — GPS Plausibility
 *
 * Checks whether a node's reported GPS trajectory is physically possible.
 * Flags speed violations, ocean placement, teleportation jumps, and
 * suspiciously perfect stationary readings.
 */

export interface TelemetryPoint {
  ts: Date
  lat: number
  lng: number
  nodeId: string
}

export interface GpsResult {
  score: number // 0 = definitely bad, 1 = definitely good
  flags: string[]
  details: Record<string, unknown>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SPEED_KMH = 200 // static sensors shouldn't move faster than this
const TELEPORTATION_KM = 1000 // >1000 km in <1 hour = teleportation
const TELEPORTATION_HOURS = 1

// Rough bounding boxes of major ocean regions (lat_min, lat_max, lng_min, lng_max)
// These are intentionally conservative — only obviously impossible ocean coords
const OCEAN_BOXES: Array<[number, number, number, number]> = [
  // Central Pacific (non-island areas)
  [-30, 30, -170, -110],
  // South Atlantic
  [-50, -10, -40, 10],
  // Indian Ocean
  [-40, -5, 50, 90],
  // South Pacific
  [-50, -20, 150, -120],
  // Arctic Ocean center
  [82, 90, -180, 180],
]

// ─── Haversine distance ────────────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// ─── Individual checks ────────────────────────────────────────────────────────

function checkCoordinateValidity(points: TelemetryPoint[]): string[] {
  const flags: string[] = []
  for (const p of points) {
    if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
      flags.push(`invalid_coordinates:${p.nodeId}@${p.ts.toISOString()}`)
    }
  }
  return flags
}

function checkOceanPlacement(
  points: TelemetryPoint[]
): { flags: string[]; oceanPoints: number } {
  const flags: string[] = []
  let oceanPoints = 0

  for (const p of points) {
    for (const [latMin, latMax, lngMin, lngMax] of OCEAN_BOXES) {
      if (p.lat >= latMin && p.lat <= latMax && p.lng >= lngMin && p.lng <= lngMax) {
        oceanPoints++
        flags.push(`ocean_placement:lat=${p.lat.toFixed(3)},lng=${p.lng.toFixed(3)}`)
        break
      }
    }
  }

  return { flags, oceanPoints }
}

function checkSpeed(points: TelemetryPoint[]): {
  flags: string[]
  maxSpeedKmh: number
  speedViolations: number
} {
  const flags: string[] = []
  let maxSpeedKmh = 0
  let speedViolations = 0

  const sorted = [...points].sort((a, b) => a.ts.getTime() - b.ts.getTime())

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]

    const distKm = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng)
    const dtHours = (curr.ts.getTime() - prev.ts.getTime()) / (1000 * 3600)

    if (dtHours <= 0) continue

    const speedKmh = distKm / dtHours
    if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh

    if (speedKmh > MAX_SPEED_KMH) {
      speedViolations++
      flags.push(
        `speed_violation:${speedKmh.toFixed(0)}km/h_between_${prev.ts.toISOString()}_and_${curr.ts.toISOString()}`
      )
    }
  }

  return { flags, maxSpeedKmh: Math.round(maxSpeedKmh), speedViolations }
}

function checkTeleportation(points: TelemetryPoint[]): {
  flags: string[]
  teleportCount: number
} {
  const flags: string[] = []
  let teleportCount = 0

  const sorted = [...points].sort((a, b) => a.ts.getTime() - b.ts.getTime())

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]

    const distKm = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng)
    const dtHours = (curr.ts.getTime() - prev.ts.getTime()) / (1000 * 3600)

    if (dtHours < TELEPORTATION_HOURS && distKm > TELEPORTATION_KM) {
      teleportCount++
      flags.push(
        `teleportation:${distKm.toFixed(0)}km_in_${(dtHours * 60).toFixed(0)}min`
      )
    }
  }

  return { flags, teleportCount }
}

function checkStaticVariance(points: TelemetryPoint[]): {
  flags: string[]
  latVariance: number
  lngVariance: number
} {
  if (points.length < 3) return { flags: [], latVariance: 0, lngVariance: 0 }

  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)

  const meanLat = lats.reduce((s, v) => s + v, 0) / lats.length
  const meanLng = lngs.reduce((s, v) => s + v, 0) / lngs.length

  const latVariance = lats.reduce((s, v) => s + (v - meanLat) ** 2, 0) / lats.length
  const lngVariance = lngs.reduce((s, v) => s + (v - meanLng) ** 2, 0) / lngs.length

  const flags: string[] = []

  // Suspiciously identical coordinates (all exactly the same) → GPS spoofing
  if (latVariance === 0 && lngVariance === 0 && points.length > 5) {
    flags.push('identical_coordinates:possible_gps_spoof')
  }

  return { flags, latVariance, lngVariance }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectGpsPlausibility(points: TelemetryPoint[]): GpsResult {
  if (points.length === 0) {
    return { score: 0.5, flags: ['no_data'], details: { point_count: 0 } }
  }

  const coordFlags = checkCoordinateValidity(points)
  const { flags: oceanFlags, oceanPoints } = checkOceanPlacement(points)
  const { flags: speedFlags, maxSpeedKmh, speedViolations } = checkSpeed(points)
  const { flags: teleportFlags, teleportCount } = checkTeleportation(points)
  const { flags: staticFlags, latVariance, lngVariance } = checkStaticVariance(points)

  const allFlags = [
    ...coordFlags,
    ...oceanFlags,
    ...speedFlags,
    ...teleportFlags,
    ...staticFlags,
  ]

  // Weight violations by severity
  const severityWeights = {
    invalid_coordinates: 3,
    ocean_placement: 2,
    speed_violation: 1,
    teleportation: 3,
    identical_coordinates: 2,
  }

  let penaltySum = 0
  for (const flag of allFlags) {
    for (const [prefix, weight] of Object.entries(severityWeights)) {
      if (flag.startsWith(prefix)) {
        penaltySum += weight
        break
      }
    }
  }

  // Normalize: 0 penalty = 1.0, each weighted violation reduces score
  // Cap at a maximum of 10 penalty units reducing to 0
  const score = Math.max(0, Math.min(1, 1 - penaltySum / 10))

  // Deduplicate flags to avoid noise (keep first occurrence of each type)
  const seenPrefixes = new Set<string>()
  const dedupedFlags: string[] = []
  for (const flag of allFlags) {
    const prefix = flag.split(':')[0]
    if (!seenPrefixes.has(prefix)) {
      seenPrefixes.add(prefix)
      dedupedFlags.push(flag)
    }
  }

  return {
    score: Math.round(score * 1000) / 1000,
    flags: dedupedFlags,
    details: {
      point_count: points.length,
      speed_violations: speedViolations,
      max_speed_kmh: maxSpeedKmh,
      teleport_count: teleportCount,
      ocean_points: oceanPoints,
      lat_variance: latVariance,
      lng_variance: lngVariance,
      invalid_coord_count: coordFlags.length,
    },
  }
}

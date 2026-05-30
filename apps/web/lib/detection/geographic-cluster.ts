/**
 * Detector F — Geographic Cluster
 *
 * Detects operators running multiple nodes in impossibly close proximity.
 * Uses a DBSCAN-like density-based clustering algorithm (pure TypeScript, no deps).
 *
 * Per-network epsilon parameters allow tuning for each network's expected
 * node density (e.g., WeatherXM needs wider spacing than Hivemapper dashcams).
 */

export interface NodeLocation {
  nodeId: string
  lat: number
  lng: number
}

export interface GeoCluster {
  center: [number, number] // [lat, lng]
  radius_m: number
  nodeIds: string[]
}

export interface GeoClusterResult {
  score: number // 0 = extreme clustering, 1 = well distributed
  flags: string[]
  suspectedClusters: GeoCluster[]
}

// ─── Per-network default epsilon (metres) ─────────────────────────────────────
// These represent the minimum plausible spacing between independent sensors.

export const NETWORK_EPSILON_M: Record<string, number> = {
  weatherxm: 500, // weather stations need ~500m separation for independent readings
  hivemapper: 100, // dashcams can be 100m apart and still be independent
  dimo: 200, // cars in a parking lot — 200m is suspicious
  'helium-iot': 300, // LoRa hotspots need 300m for meaningful coverage diversity
  'helium-mobile': 250,
  default: 100,
}

const MIN_POINTS = 3 // minimum cluster size to flag

// ─── Haversine distance in metres ─────────────────────────────────────────────

function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// ─── DBSCAN implementation ────────────────────────────────────────────────────

type Label = number | 'noise'

function dbscan(
  points: NodeLocation[],
  epsilon: number,
  minPts: number
): Map<string, Label> {
  const labels = new Map<string, Label>()
  let clusterIndex = 0

  const getNeighbours = (idx: number): number[] => {
    const results: number[] = []
    for (let i = 0; i < points.length; i++) {
      if (i === idx) continue
      const d = haversineMetres(
        points[idx].lat,
        points[idx].lng,
        points[i].lat,
        points[i].lng
      )
      if (d <= epsilon) results.push(i)
    }
    return results
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (labels.has(p.nodeId)) continue

    const neighbours = getNeighbours(i)

    if (neighbours.length < minPts - 1) {
      labels.set(p.nodeId, 'noise')
      continue
    }

    clusterIndex++
    labels.set(p.nodeId, clusterIndex)

    const seeds = new Set(neighbours)

    for (const seedIdx of seeds) {
      const seedNode = points[seedIdx]
      const seedLabel = labels.get(seedNode.nodeId)

      if (seedLabel === 'noise') {
        labels.set(seedNode.nodeId, clusterIndex)
      }

      if (seedLabel !== undefined && seedLabel !== 'noise') continue

      labels.set(seedNode.nodeId, clusterIndex)

      const seedNeighbours = getNeighbours(seedIdx)
      if (seedNeighbours.length >= minPts - 1) {
        for (const nn of seedNeighbours) seeds.add(nn)
      }
    }
  }

  return labels
}

// ─── Cluster geometry helpers ─────────────────────────────────────────────────

function computeClusterCenter(nodes: NodeLocation[]): [number, number] {
  const lat = nodes.reduce((s, n) => s + n.lat, 0) / nodes.length
  const lng = nodes.reduce((s, n) => s + n.lng, 0) / nodes.length
  return [lat, lng]
}

function computeClusterRadius(
  center: [number, number],
  nodes: NodeLocation[]
): number {
  let maxDist = 0
  for (const n of nodes) {
    const d = haversineMetres(center[0], center[1], n.lat, n.lng)
    if (d > maxDist) maxDist = d
  }
  return Math.round(maxDist)
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectGeographicClusters(
  nodes: NodeLocation[],
  maxRadiusMeters?: number,
  network?: string
): GeoClusterResult {
  if (nodes.length === 0) {
    return { score: 1, flags: ['no_nodes'], suspectedClusters: [] }
  }

  const epsilon =
    maxRadiusMeters ??
    (network ? (NETWORK_EPSILON_M[network] ?? NETWORK_EPSILON_M.default) : NETWORK_EPSILON_M.default)

  const labels = dbscan(nodes, epsilon, MIN_POINTS)

  // Group nodes by cluster label
  const clusters = new Map<number, NodeLocation[]>()
  for (const node of nodes) {
    const label = labels.get(node.nodeId)
    if (label === undefined || label === 'noise') continue
    const group = clusters.get(label as number) ?? []
    group.push(node)
    clusters.set(label as number, group)
  }

  const suspectedClusters: GeoCluster[] = []
  const flags: string[] = []
  let flaggedNodes = 0

  for (const [, members] of clusters) {
    if (members.length < MIN_POINTS) continue

    const center = computeClusterCenter(members)
    const radius = computeClusterRadius(center, members)

    suspectedClusters.push({
      center,
      radius_m: radius,
      nodeIds: members.map((n) => n.nodeId),
    })

    flaggedNodes += members.length
    flags.push(
      `geo_cluster:${members.length}_nodes_within_${radius}m_of_[${center[0].toFixed(4)},${center[1].toFixed(4)}]`
    )
  }

  // Score: fraction of nodes NOT in a suspicious cluster
  const fractionClustered = flaggedNodes / nodes.length
  const score = Math.max(0, Math.min(1, 1 - fractionClustered))

  // Extra severity penalty for very tight clusters
  let tightClusterPenalty = 0
  for (const c of suspectedClusters) {
    if (c.radius_m < 50 && c.nodeIds.length > 5) {
      tightClusterPenalty += 0.1
      flags.push(`tight_cluster:${c.nodeIds.length}_nodes_within_${c.radius_m}m`)
    }
  }

  const finalScore = Math.max(0, Math.min(1, score - tightClusterPenalty))

  return {
    score: Math.round(finalScore * 1000) / 1000,
    flags,
    suspectedClusters,
  }
}

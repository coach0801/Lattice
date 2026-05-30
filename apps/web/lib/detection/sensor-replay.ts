/**
 * Detector B — Sensor Replay
 *
 * Detects nodes that are replaying (copying) sensor data from another node.
 * Two key signals:
 *   1. Identical payload hash across different nodes within a 10-minute window
 *   2. Suspiciously high time-series correlation (>0.95) between nodes over 7 days
 */

export interface Reading {
  ts: Date
  nodeId: string
  value: number
  payloadHash: string
}

export interface ReplayResult {
  score: number // 0 = definitely replaying, 1 = all unique
  flags: string[]
  suspectedPairs: [string, string][] // pairs of nodeIds suspected of sharing data
}

// ─── Hash deduplication within time window ────────────────────────────────────

const REPLAY_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

interface HashMatch {
  hash: string
  nodeA: string
  nodeB: string
  tsA: Date
  tsB: Date
}

function findHashDuplicates(readings: Reading[]): HashMatch[] {
  // Group readings by hash
  const byHash = new Map<string, Reading[]>()
  for (const r of readings) {
    const existing = byHash.get(r.payloadHash) ?? []
    existing.push(r)
    byHash.set(r.payloadHash, existing)
  }

  const matches: HashMatch[] = []

  for (const [hash, group] of byHash) {
    if (group.length < 2) continue

    // Check each pair within the window
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]

        if (a.nodeId === b.nodeId) continue // same node is fine

        const timeDiff = Math.abs(a.ts.getTime() - b.ts.getTime())
        if (timeDiff <= REPLAY_WINDOW_MS) {
          matches.push({
            hash,
            nodeA: a.nodeId,
            nodeB: b.nodeId,
            tsA: a.ts,
            tsB: b.ts,
          })
        }
      }
    }
  }

  return matches
}

// ─── Pearson correlation ──────────────────────────────────────────────────────

/**
 * Compute the Pearson correlation coefficient between two aligned numeric series.
 * Returns NaN if standard deviation is 0.
 */
function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return 0

  const meanX = xs.slice(0, n).reduce((s, v) => s + v, 0) / n
  const meanY = ys.slice(0, n).reduce((s, v) => s + v, 0) / n

  let covXY = 0
  let varX = 0
  let varY = 0

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    covXY += dx * dy
    varX += dx * dx
    varY += dy * dy
  }

  const denom = Math.sqrt(varX * varY)
  return denom === 0 ? 0 : covXY / denom
}

// ─── Time-series alignment ────────────────────────────────────────────────────

/**
 * Align two nodes' reading values by rounding their timestamps to the nearest
 * 5-minute bucket. Returns parallel arrays of values for overlapping buckets.
 */
function alignTimeSeries(
  aReadings: Reading[],
  bReadings: Reading[]
): { aValues: number[]; bValues: number[] } {
  const BUCKET_MS = 5 * 60 * 1000 // 5-minute buckets

  const aMap = new Map<number, number>()
  const bMap = new Map<number, number>()

  for (const r of aReadings) {
    const bucket = Math.round(r.ts.getTime() / BUCKET_MS)
    // Average if multiple readings in same bucket
    aMap.set(bucket, ((aMap.get(bucket) ?? r.value) + r.value) / 2)
  }

  for (const r of bReadings) {
    const bucket = Math.round(r.ts.getTime() / BUCKET_MS)
    bMap.set(bucket, ((bMap.get(bucket) ?? r.value) + r.value) / 2)
  }

  const aValues: number[] = []
  const bValues: number[] = []

  for (const [bucket, aVal] of aMap) {
    const bVal = bMap.get(bucket)
    if (bVal !== undefined) {
      aValues.push(aVal)
      bValues.push(bVal)
    }
  }

  return { aValues, bValues }
}

// ─── Correlation check across node pairs ─────────────────────────────────────

interface CorrelationMatch {
  nodeA: string
  nodeB: string
  correlation: number
  sampleSize: number
}

const CORRELATION_THRESHOLD = 0.95
const MIN_OVERLAP_SAMPLES = 20 // need enough overlap to be meaningful

function findHighCorrelationPairs(readings: Reading[]): CorrelationMatch[] {
  // Group readings by nodeId
  const byNode = new Map<string, Reading[]>()
  for (const r of readings) {
    const existing = byNode.get(r.nodeId) ?? []
    existing.push(r)
    byNode.set(r.nodeId, existing)
  }

  const nodes = Array.from(byNode.keys())
  const matches: CorrelationMatch[] = []

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeA = nodes[i]
      const nodeB = nodes[j]

      const { aValues, bValues } = alignTimeSeries(
        byNode.get(nodeA)!,
        byNode.get(nodeB)!
      )

      if (aValues.length < MIN_OVERLAP_SAMPLES) continue

      const corr = pearsonCorrelation(aValues, bValues)

      if (corr >= CORRELATION_THRESHOLD) {
        matches.push({
          nodeA,
          nodeB,
          correlation: Math.round(corr * 10000) / 10000,
          sampleSize: aValues.length,
        })
      }
    }
  }

  return matches
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectSensorReplay(readings: Reading[]): ReplayResult {
  if (readings.length === 0) {
    return { score: 0.5, flags: ['no_data'], suspectedPairs: [] }
  }

  const flags: string[] = []
  const suspectedPairSet = new Map<string, [string, string]>()

  // 1. Hash duplicates across nodes within 10-minute window
  const hashMatches = findHashDuplicates(readings)
  for (const m of hashMatches) {
    const key = [m.nodeA, m.nodeB].sort().join('|')
    suspectedPairSet.set(key, [m.nodeA, m.nodeB])
  }

  if (hashMatches.length > 0) {
    const uniquePairs = new Set(hashMatches.map((m) => [m.nodeA, m.nodeB].sort().join('|')))
    flags.push(`hash_replay:${hashMatches.length}_matches_across_${uniquePairs.size}_pairs`)
  }

  // 2. High time-series correlation (only worthwhile when there are enough readings per node)
  const nodeCount = new Set(readings.map((r) => r.nodeId)).size
  if (nodeCount >= 2) {
    const corrMatches = findHighCorrelationPairs(readings)
    for (const m of corrMatches) {
      const key = [m.nodeA, m.nodeB].sort().join('|')
      suspectedPairSet.set(key, [m.nodeA, m.nodeB])
      flags.push(
        `high_correlation:${m.nodeA}_and_${m.nodeB}_r=${m.correlation}_n=${m.sampleSize}`
      )
    }
  }

  const suspectedPairs = Array.from(suspectedPairSet.values())

  // Score: based on fraction of nodes involved in suspected pairs
  const suspectedNodes = new Set(suspectedPairs.flatMap(([a, b]) => [a, b]))
  const fractionSuspected = nodeCount > 0 ? suspectedNodes.size / nodeCount : 0

  // Additional penalty for hash matches (strongest signal)
  const hashPenalty = hashMatches.length > 0 ? Math.min(0.4, hashMatches.length * 0.05) : 0

  const score = Math.max(0, Math.min(1, 1 - fractionSuspected * 0.6 - hashPenalty))

  return {
    score: Math.round(score * 1000) / 1000,
    flags,
    suspectedPairs,
  }
}

/**
 * Composite Scorer
 *
 * Combines outputs from individual detectors into a single 0–100 score
 * using a weighted geometric mean. Lower detector scores (more suspicious)
 * produce lower composite scores.
 *
 * Scoring convention:
 *   Detector output:  0 = bad (Sybil),   1 = good (clean)
 *   Composite score:  0 = bad (Sybil), 100 = good (clean)
 *   Band: sybil < 25 ≤ suspicious < 50 ≤ watch < 80 ≤ clean
 */

export interface DetectorOutputs {
  gps?: number // 0–1 from gps-plausibility
  timing?: number // 0–1 from timing-anomaly
  replay?: number // 0–1 from sensor-replay
  geo?: number // 0–1 from geographic-cluster
}

export interface CompositeScore {
  score: number // 0–100
  band: 'clean' | 'watch' | 'suspicious' | 'sybil'
  subScores: DetectorOutputs
}

// Default weights — must sum to 1.0
const DEFAULT_WEIGHTS: Required<DetectorOutputs> = {
  gps: 0.25,
  timing: 0.25,
  replay: 0.30,
  geo: 0.20,
}

// ─── Band thresholds ──────────────────────────────────────────────────────────

function toBand(score: number): CompositeScore['band'] {
  if (score >= 80) return 'clean'
  if (score >= 50) return 'watch'
  if (score >= 25) return 'suspicious'
  return 'sybil'
}

// ─── Weighted geometric mean ──────────────────────────────────────────────────

/**
 * Weighted geometric mean of values clamped to (ε, 1].
 * Formula: exp( Σ w_i * ln(v_i) )
 *
 * Using geometric mean (vs arithmetic) because it is harsher on outliers —
 * a single detector with score 0 should pull the composite towards 0.
 */
function weightedGeometricMean(
  values: { value: number; weight: number }[]
): number {
  if (values.length === 0) return 0.5

  const EPSILON = 1e-6 // prevent ln(0)
  let logSum = 0
  let totalWeight = 0

  for (const { value, weight } of values) {
    const clamped = Math.max(EPSILON, Math.min(1, value))
    logSum += weight * Math.log(clamped)
    totalWeight += weight
  }

  if (totalWeight === 0) return 0.5

  return Math.exp(logSum / totalWeight)
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeCompositeScore(
  outputs: DetectorOutputs,
  weights?: Partial<DetectorOutputs>
): CompositeScore {
  const resolvedWeights: Required<DetectorOutputs> = {
    gps: weights?.gps ?? DEFAULT_WEIGHTS.gps,
    timing: weights?.timing ?? DEFAULT_WEIGHTS.timing,
    replay: weights?.replay ?? DEFAULT_WEIGHTS.replay,
    geo: weights?.geo ?? DEFAULT_WEIGHTS.geo,
  }

  // Normalise weights so they sum to 1.0 even if custom weights don't
  const weightSum = Object.values(resolvedWeights).reduce((s, w) => s + w, 0)

  const pairs: { key: keyof DetectorOutputs; value: number; weight: number }[] = []

  for (const key of ['gps', 'timing', 'replay', 'geo'] as const) {
    const raw = outputs[key]
    if (raw === undefined || raw === null) continue

    const clamped = Math.max(0, Math.min(1, raw))
    pairs.push({
      key,
      value: clamped,
      weight: resolvedWeights[key] / weightSum,
    })
  }

  if (pairs.length === 0) {
    // No detector data — return neutral score
    return { score: 50, band: 'watch', subScores: outputs }
  }

  // Geometric mean of detector outputs (each 0–1)
  const rawMean = weightedGeometricMean(pairs.map((p) => ({ value: p.value, weight: p.weight })))

  // Map to 0–100 integer
  const score = Math.round(rawMean * 100)

  // Build sub-scores object with only the detectors that ran
  const subScores: DetectorOutputs = {}
  for (const { key, value } of pairs) {
    // Sub-scores expressed 0–100 to match composite scale
    subScores[key] = Math.round(value * 100) / 100
  }

  return {
    score,
    band: toBand(score),
    subScores,
  }
}

// ─── Utility: score a node from pre-run detector results ─────────────────────

export interface NodeDetectorResults {
  gpsResult?: { score: number }
  timingResult?: { score: number }
  replayResult?: { score: number }
  geoResult?: { score: number }
}

export function scoreNode(
  results: NodeDetectorResults,
  weights?: Partial<DetectorOutputs>
): CompositeScore {
  return computeCompositeScore(
    {
      gps: results.gpsResult?.score,
      timing: results.timingResult?.score,
      replay: results.replayResult?.score,
      geo: results.geoResult?.score,
    },
    weights
  )
}

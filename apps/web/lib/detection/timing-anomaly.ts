/**
 * Detector D — Timing Anomaly
 *
 * Identifies scripted/botted behaviour by analysing claim submission timing.
 * Low inter-arrival entropy, round timestamps, burst submissions, and
 * impossibly perfect uptime are all strong Sybil signals.
 */

export interface ClaimRecord {
  ts: Date
  amount: number
  nodeId: string
}

export interface TimingResult {
  score: number // 0 = definitely scripted, 1 = definitely natural
  flags: string[]
  entropy: number // Shannon entropy of inter-arrival time distribution
  roundness: number // fraction of claims landing on :00 or :30 seconds
}

// ─── Entropy helpers ──────────────────────────────────────────────────────────

/**
 * Shannon entropy (bits) over a discrete probability distribution.
 * H = -Σ p_i * log2(p_i)
 */
function shannonEntropy(counts: Map<number, number>): number {
  const total = Array.from(counts.values()).reduce((s, v) => s + v, 0)
  if (total === 0) return 0

  let H = 0
  for (const count of counts.values()) {
    const p = count / total
    if (p > 0) H -= p * Math.log2(p)
  }
  return H
}

/**
 * Bucket inter-arrival times into 30-second bins for entropy calculation.
 * Real sensors have high entropy (varied delays).
 * Scripts have low entropy (e.g., always fire every 300 seconds).
 */
function computeInterArrivalEntropy(sortedTs: number[]): number {
  if (sortedTs.length < 3) return 1 // not enough data → assume fine

  const counts = new Map<number, number>()
  for (let i = 1; i < sortedTs.length; i++) {
    const diffSec = Math.round((sortedTs[i] - sortedTs[i - 1]) / 1000)
    const bucket = Math.floor(diffSec / 30) // 30-second buckets
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }

  return shannonEntropy(counts)
}

// ─── Round-timestamp check ────────────────────────────────────────────────────

/**
 * Fraction of claims arriving at round seconds (:00 or :30 past the minute).
 * Automated scripts commonly fire on exact schedule.
 */
function computeRoundness(dates: Date[]): number {
  if (dates.length === 0) return 0

  const roundCount = dates.filter((d) => {
    const sec = d.getSeconds()
    return sec === 0 || sec === 30
  }).length

  return roundCount / dates.length
}

// ─── Batch submission detection ───────────────────────────────────────────────

interface BatchInfo {
  windowStart: Date
  count: number
}

/**
 * Find windows where many claims were submitted within 1 second.
 * Legitimate sensors rarely submit >3 claims per second.
 */
function detectBatchSubmissions(sortedTs: number[]): BatchInfo[] {
  const WINDOW_MS = 1000
  const MIN_BATCH_SIZE = 4

  const batches: BatchInfo[] = []
  let windowStart = 0
  let windowCount = 0

  for (let i = 0; i < sortedTs.length; i++) {
    if (i === 0) {
      windowStart = sortedTs[i]
      windowCount = 1
      continue
    }

    if (sortedTs[i] - windowStart <= WINDOW_MS) {
      windowCount++
    } else {
      if (windowCount >= MIN_BATCH_SIZE) {
        batches.push({ windowStart: new Date(windowStart), count: windowCount })
      }
      windowStart = sortedTs[i]
      windowCount = 1
    }
  }

  if (windowCount >= MIN_BATCH_SIZE) {
    batches.push({ windowStart: new Date(windowStart), count: windowCount })
  }

  return batches
}

// ─── Perfect uptime detection ─────────────────────────────────────────────────

/**
 * Real devices go offline occasionally.
 * If a device has claimed >99.5% uptime over 7+ days, it is suspicious.
 */
function detectPerfectUptime(sortedTs: number[]): boolean {
  if (sortedTs.length < 20) return false

  const spanMs = sortedTs[sortedTs.length - 1] - sortedTs[0]
  const spanDays = spanMs / (1000 * 60 * 60 * 24)

  if (spanDays < 7) return false

  // Expected claims if device submitted once per hour
  const expectedHourly = spanDays * 24
  const actualRate = sortedTs.length / expectedHourly

  // If actual ≥ expected (i.e., ≥1 claim/hr every hour for 7+ days), flag
  return actualRate >= 0.995
}

// ─── Periodic pattern detection ──────────────────────────────────────────────

/**
 * Check if inter-arrival times show a strongly periodic pattern
 * (coefficient of variation < 0.05 = nearly constant interval = scripted).
 */
function detectStrongPeriodicity(sortedTs: number[]): {
  isperiodic: boolean
  cv: number
  meanIntervalSec: number
} {
  if (sortedTs.length < 5) return { isperiodic: false, cv: 1, meanIntervalSec: 0 }

  const intervals: number[] = []
  for (let i = 1; i < sortedTs.length; i++) {
    intervals.push((sortedTs[i] - sortedTs[i - 1]) / 1000)
  }

  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length
  const variance =
    intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length
  const stdDev = Math.sqrt(variance)
  const cv = mean > 0 ? stdDev / mean : 1

  return { isperiodic: cv < 0.05, cv, meanIntervalSec: Math.round(mean) }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectTimingAnomalies(claims: ClaimRecord[]): TimingResult {
  if (claims.length === 0) {
    return { score: 0.5, flags: ['no_data'], entropy: 0, roundness: 0 }
  }

  const sorted = [...claims].sort((a, b) => a.ts.getTime() - b.ts.getTime())
  const sortedTs = sorted.map((c) => c.ts.getTime())
  const dates = sorted.map((c) => c.ts)

  const flags: string[] = []

  // 1. Inter-arrival entropy
  const entropy = computeInterArrivalEntropy(sortedTs)
  // Real sensors: entropy > 3.0 bits. Scripts: entropy < 1.5 bits
  if (entropy < 1.5 && sorted.length >= 10) {
    flags.push(`low_entropy:${entropy.toFixed(3)}_bits`)
  }

  // 2. Round-number timestamps
  const roundness = computeRoundness(dates)
  if (roundness > 0.8 && sorted.length >= 10) {
    flags.push(`round_timestamps:${(roundness * 100).toFixed(1)}pct_at_:00_or_:30`)
  }

  // 3. Batch submissions
  const batches = detectBatchSubmissions(sortedTs)
  if (batches.length > 0) {
    flags.push(
      `batch_submissions:${batches.length}_bursts_detected_max_${Math.max(...batches.map((b) => b.count))}_per_second`
    )
  }

  // 4. Perfect uptime
  const hasPerfectUptime = detectPerfectUptime(sortedTs)
  if (hasPerfectUptime) {
    flags.push('perfect_uptime:>99.5pct_over_7days')
  }

  // 5. Strongly periodic pattern
  const { isperiodic, cv, meanIntervalSec } = detectStrongPeriodicity(sortedTs)
  if (isperiodic) {
    flags.push(
      `scripted_periodicity:cv=${cv.toFixed(4)}_interval=${meanIntervalSec}s`
    )
  }

  // Score calculation
  // Each flag type reduces the score with different weights
  const penaltyMap: Record<string, number> = {
    low_entropy: 3,
    round_timestamps: 2,
    batch_submissions: 2,
    perfect_uptime: 2,
    scripted_periodicity: 3,
    no_data: 1,
  }

  let penaltySum = 0
  for (const flag of flags) {
    for (const [prefix, penalty] of Object.entries(penaltyMap)) {
      if (flag.startsWith(prefix)) {
        penaltySum += penalty
        break
      }
    }
  }

  // Max penalty = 12 → score = 0; 0 penalty → score = 1
  const score = Math.max(0, Math.min(1, 1 - penaltySum / 12))

  return {
    score: Math.round(score * 1000) / 1000,
    flags,
    entropy: Math.round(entropy * 1000) / 1000,
    roundness: Math.round(roundness * 1000) / 1000,
  }
}

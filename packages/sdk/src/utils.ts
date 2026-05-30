import { keccak256, encodePacked } from 'viem'
import { createHmac } from 'crypto'
import type { ScoreBand } from './types.js'

/**
 * Maps a 0-100 integrity score to a ScoreBand label.
 *
 * Band thresholds (inclusive):
 *   85-100 → clean
 *   60-84  → watch
 *   30-59  → suspicious
 *   0-29   → sybil
 */
export function getBand(score: number): ScoreBand {
  if (score < 0 || score > 100) {
    throw new RangeError(`Score must be between 0 and 100, got ${score}`)
  }
  if (score >= 85) return 'clean'
  if (score >= 60) return 'watch'
  if (score >= 30) return 'suspicious'
  return 'sybil'
}

/**
 * Computes a keccak256 hash of (network, nodeId) for use as the on-chain
 * node identifier submitted to the LatticeAttestation contract.
 *
 * @param network - The network slug (e.g. 'hivemapper')
 * @param nodeId  - The node's unique identifier within that network
 * @returns Hex-encoded keccak256 hash prefixed with '0x'
 */
export function hashNodeId(network: string, nodeId: string): `0x${string}` {
  return keccak256(
    encodePacked(['string', 'string'], [network, nodeId])
  )
}

/**
 * Verifies an HMAC-SHA256 webhook signature.
 *
 * The signature is expected to be a hex-encoded HMAC-SHA256 of the raw
 * request body using the shared secret. Lattice computes it as:
 *   HMAC-SHA256(secret, rawBody).hexdigest()
 *
 * @param payload   - The raw request body string exactly as received
 * @param signature - The hex string from the `X-Lattice-Signature` header
 * @param secret    - The hmacSecret you provided when creating the subscription
 * @returns true if the signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!payload || !signature || !secret) return false
  try {
    const expected = createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex')
    // Constant-time comparison to prevent timing attacks
    if (expected.length !== signature.length) return false
    let diff = 0
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
    }
    return diff === 0
  } catch {
    return false
  }
}

/**
 * Validates that a network slug is one of the supported values.
 */
export function isValidNetwork(value: string): boolean {
  return ['hivemapper', 'geodnet', 'weatherxm', 'dimo', 'nubila'].includes(value)
}

/**
 * Builds a query string from a plain object, omitting undefined values.
 */
export function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

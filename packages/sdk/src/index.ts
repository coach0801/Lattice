/**
 * @lattice-protocol/sdk
 *
 * Official TypeScript SDK for Lattice Protocol — DePIN integrity attestations.
 *
 * @example
 * ```ts
 * import { LatticeClient } from '@lattice-protocol/sdk'
 *
 * const client = new LatticeClient({ apiKey: 'lp_your_key' })
 *
 * const score = await client.getScore('hivemapper', 'node-abc123')
 * console.log(score.band) // 'clean' | 'watch' | 'suspicious' | 'sybil'
 *
 * if (client.isSybil(score)) {
 *   console.warn('Node flagged as high-confidence Sybil')
 * }
 * ```
 */

// Core client
export { LatticeClient } from './client.js'

// All types
export type {
  Network,
  ScoreBand,
  NodeScore,
  NodeDetail,
  DetectionFlag,
  Cluster,
  ClusterDetail,
  ClusterMember,
  NetworkHealth,
  LatticeConfig,
  WebhookSubscription,
  WebhookEventType,
  PaginationOptions,
  ApiResponse,
} from './types.js'

// Error classes
export {
  LatticeError,
  LatticeApiError,
  LatticeNetworkError,
  LatticeValidationError,
} from './errors.js'

// Utility functions
export {
  getBand,
  hashNodeId,
  verifyWebhookSignature,
  isValidNetwork,
} from './utils.js'

import type {
  LatticeConfig,
  Network,
  NodeScore,
  NodeDetail,
  NetworkHealth,
  Cluster,
  ClusterDetail,
  WebhookSubscription,
  PaginationOptions,
} from './types.js'
import { LatticeApiError, LatticeNetworkError, LatticeValidationError } from './errors.js'
import { getBand as _getBand, isValidNetwork, buildQueryString } from './utils.js'
import type { ScoreBand } from './types.js'

const DEFAULT_BASE_URL = 'https://lattice-protocol.vercel.app'
const DEFAULT_CHAIN_ID = 11155420 // OP Sepolia

/**
 * Main client for the Lattice Protocol API.
 *
 * @example
 * ```ts
 * const client = new LatticeClient({ apiKey: 'lp_your_key' })
 * const score = await client.getScore('hivemapper', 'node-abc123')
 * console.log(score.band) // 'clean' | 'watch' | 'suspicious' | 'sybil'
 * ```
 */
export class LatticeClient {
  private readonly baseUrl: string
  private readonly apiKey: string | undefined
  private readonly chainId: number
  private readonly rpcUrl: string | undefined

  constructor(config: LatticeConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.chainId = config.chainId ?? DEFAULT_CHAIN_ID
    this.rpcUrl = config.rpcUrl
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }
    return headers
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...this.buildHeaders(),
          ...(init?.headers as Record<string, string> | undefined),
        },
      })
    } catch (err) {
      throw new LatticeNetworkError(
        `Network error reaching Lattice API at ${url}: ${(err as Error).message}`,
        err
      )
    }

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = await response.text().catch(() => null)
      }
      const message =
        typeof body === 'object' && body !== null && 'error' in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${response.status} ${response.statusText}`
      throw new LatticeApiError(response.status, message, body)
    }

    return response.json() as Promise<T>
  }

  private validateNetwork(network: string): void {
    if (!isValidNetwork(network)) {
      throw new LatticeValidationError(
        `Unknown network "${network}". Must be one of: hivemapper, geodnet, weatherxm, dimo, nubila`,
        'network'
      )
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Score queries
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Fetch the current integrity score for a specific node.
   */
  async getScore(network: Network, nodeId: string): Promise<NodeScore> {
    this.validateNetwork(network)
    if (!nodeId?.trim()) {
      throw new LatticeValidationError('nodeId must be a non-empty string', 'nodeId')
    }
    return this.request<NodeScore>(
      `/api/v1/score/${encodeURIComponent(network)}/${encodeURIComponent(nodeId)}`
    )
  }

  /**
   * Fetch detailed information for a node, including score history and flags.
   */
  async getNode(network: Network, nodeId: string): Promise<NodeDetail> {
    this.validateNetwork(network)
    if (!nodeId?.trim()) {
      throw new LatticeValidationError('nodeId must be a non-empty string', 'nodeId')
    }
    return this.request<NodeDetail>(
      `/api/v1/node/${encodeURIComponent(network)}/${encodeURIComponent(nodeId)}`
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Network queries
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Fetch aggregate health metrics for a specific DePIN network.
   */
  async getNetworkHealth(network: Network): Promise<NetworkHealth> {
    this.validateNetwork(network)
    return this.request<NetworkHealth>(
      `/api/v1/network/${encodeURIComponent(network)}`
    )
  }

  /**
   * List health summaries for all supported networks.
   */
  async listNetworks(): Promise<NetworkHealth[]> {
    return this.request<NetworkHealth[]>('/api/v1/networks')
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cluster queries
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * List detected Sybil operator clusters, paginated.
   */
  async listClusters(opts: PaginationOptions = {}): Promise<Cluster[]> {
    const qs = buildQueryString({ limit: opts.limit, offset: opts.offset })
    return this.request<Cluster[]>(`/api/v1/clusters${qs}`)
  }

  /**
   * Fetch full details for a cluster, including its member nodes.
   */
  async getCluster(clusterId: string): Promise<ClusterDetail> {
    if (!clusterId?.trim()) {
      throw new LatticeValidationError('clusterId must be a non-empty string', 'clusterId')
    }
    return this.request<ClusterDetail>(
      `/api/v1/clusters/${encodeURIComponent(clusterId)}`
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Webhook management
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Register a webhook endpoint to receive real-time Lattice events.
   *
   * @returns subscriptionId — store this to manage the subscription later.
   */
  async subscribeWebhook(sub: WebhookSubscription): Promise<{ subscriptionId: string }> {
    if (!sub.callbackUrl) {
      throw new LatticeValidationError('callbackUrl is required', 'callbackUrl')
    }
    if (!sub.hmacSecret || sub.hmacSecret.length < 16) {
      throw new LatticeValidationError(
        'hmacSecret must be at least 16 characters',
        'hmacSecret'
      )
    }
    if (!sub.eventTypes?.length) {
      throw new LatticeValidationError('eventTypes must not be empty', 'eventTypes')
    }
    return this.request<{ subscriptionId: string }>('/api/v1/webhooks', {
      method: 'POST',
      body: JSON.stringify(sub),
    })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Utility methods
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns true if the node's score is in the 'sybil' band (score < 30).
   */
  isSybil(score: NodeScore): boolean {
    return score.band === 'sybil' || score.score < 30
  }

  /**
   * Maps a numeric 0-100 score to a ScoreBand string.
   * Delegates to the standalone getBand utility.
   */
  getBand(score: number): ScoreBand {
    return _getBand(score)
  }

  /**
   * Returns the chainId configured for on-chain reads.
   */
  getChainId(): number {
    return this.chainId
  }

  /**
   * Returns the RPC URL configured for on-chain reads, if any.
   */
  getRpcUrl(): string | undefined {
    return this.rpcUrl
  }
}

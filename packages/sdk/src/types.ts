export type Network = 'hivemapper' | 'geodnet' | 'weatherxm' | 'dimo' | 'nubila'
export type ScoreBand = 'clean' | 'watch' | 'suspicious' | 'sybil'

export interface NodeScore {
  network: Network
  nodeId: string
  score: number // 0-100
  band: ScoreBand
  attestedAt: string // ISO timestamp
  attestationId?: string
  subScores: {
    gpsPlausibility?: number
    timingAnomaly?: number
    sensorReplay?: number
    geographicCluster?: number
    crossNetworkLinkage?: number
  }
}

export interface NodeDetail extends NodeScore {
  ownerWallet?: string
  firstSeen: string
  lastSeen: string
  scoreHistory: { ts: string; score: number }[]
  activeFlags: DetectionFlag[]
  clusterMemberships: { clusterId: string; confidence: number }[]
}

export interface DetectionFlag {
  id: string
  detector: string
  severity: 'low' | 'medium' | 'high'
  confidence: number
  detectedAt: string
  evidence: Record<string, unknown>
}

export interface Cluster {
  clusterId: string
  memberCount: number
  networkCount: number
  networks: Network[]
  meanConfidence: number
  firstDetected: string
  status: 'active' | 'dissolved'
}

export interface ClusterMember {
  network: Network
  nodeId: string
  ownerWallet?: string
  confidence: number
}

export interface ClusterDetail extends Cluster {
  members: ClusterMember[]
}

export interface NetworkHealth {
  network: Network
  totalNodes: number
  meanScore: number
  flaggedPct: number
  clusterCount: number
  scoreDistribution: { band: ScoreBand; count: number }[]
}

export interface LatticeConfig {
  apiKey?: string
  baseUrl?: string // default: https://lattice-protocol.vercel.app
  chainId?: number // default: 11155420 (OP Sepolia)
  rpcUrl?: string
}

export interface WebhookSubscription {
  callbackUrl: string
  eventTypes: WebhookEventType[]
  hmacSecret: string
}

export type WebhookEventType =
  | 'score.threshold_crossed'
  | 'cluster.detected'
  | 'cluster.dissolved'
  | 'dispute.opened'
  | 'dispute.resolved'
  | 'attestation.revoked'

export interface PaginationOptions {
  limit?: number
  offset?: number
}

export interface ApiResponse<T> {
  data: T
  meta?: {
    total?: number
    limit?: number
    offset?: number
  }
}

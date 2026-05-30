export const NETWORKS = [
  {
    slug: 'hivemapper',
    name: 'Hivemapper',
    description: 'Decentralized street-level mapping network powered by dashcam contributors',
    icon: '🗺️',
    color: '#f97316',
    accentColor: 'orange',
    totalNodes: 142800,
    website: 'https://hivemapper.com',
  },
  {
    slug: 'geodnet',
    name: 'GEODNET',
    description: 'High-precision GNSS reference station network for RTK positioning',
    icon: '📡',
    color: '#6366f1',
    accentColor: 'indigo',
    totalNodes: 8240,
    website: 'https://geodnet.com',
  },
  {
    slug: 'weatherxm',
    name: 'WeatherXM',
    description: 'Community-owned weather station network providing hyper-local data',
    icon: '🌤️',
    color: '#3b82f6',
    accentColor: 'blue',
    totalNodes: 7600,
    website: 'https://weatherxm.com',
  },
  {
    slug: 'dimo',
    name: 'DIMO',
    description: 'Connected vehicle data network enabling driver-owned mobility data',
    icon: '🚗',
    color: '#22c55e',
    accentColor: 'green',
    totalNodes: 92500,
    website: 'https://dimo.zone',
  },
  {
    slug: 'nubila',
    name: 'Nubila',
    description: 'Decentralized cloud sensing network for atmospheric intelligence',
    icon: '☁️',
    color: '#8b5cf6',
    accentColor: 'violet',
    totalNodes: 3100,
    website: 'https://nubila.ai',
  },
] as const

export type NetworkSlug = (typeof NETWORKS)[number]['slug']

export const SCORE_BANDS = [
  {
    label: 'Clean',
    min: 85,
    max: 100,
    color: '#22c55e',
    bgClass: 'bg-green-500/20',
    textClass: 'text-green-400',
    borderClass: 'border-green-500/30',
    description: 'No significant anomalies detected',
  },
  {
    label: 'Watch',
    min: 60,
    max: 84,
    color: '#eab308',
    bgClass: 'bg-yellow-500/20',
    textClass: 'text-yellow-400',
    borderClass: 'border-yellow-500/30',
    description: 'Minor anomalies, monitoring recommended',
  },
  {
    label: 'Suspicious',
    min: 30,
    max: 59,
    color: '#f97316',
    bgClass: 'bg-orange-500/20',
    textClass: 'text-orange-400',
    borderClass: 'border-orange-500/30',
    description: 'Multiple anomaly signals detected',
  },
  {
    label: 'High-Confidence Sybil',
    min: 0,
    max: 29,
    color: '#ef4444',
    bgClass: 'bg-red-500/20',
    textClass: 'text-red-400',
    borderClass: 'border-red-500/30',
    description: 'Strong evidence of Sybil activity',
  },
] as const

export const DETECTORS = [
  {
    id: 'spatial_clustering',
    name: 'Spatial Clustering',
    description: 'Detects nodes with suspiciously similar GPS coordinates',
    weight: 0.25,
  },
  {
    id: 'temporal_sync',
    name: 'Temporal Sync',
    description: 'Identifies nodes with correlated uptime patterns',
    weight: 0.20,
  },
  {
    id: 'wallet_graph',
    name: 'Wallet Graph',
    description: 'Analyzes on-chain wallet relationships and fund flows',
    weight: 0.20,
  },
  {
    id: 'hardware_fingerprint',
    name: 'Hardware Fingerprint',
    description: 'Checks for shared hardware identifiers or spoofed attestations',
    weight: 0.15,
  },
  {
    id: 'data_quality',
    name: 'Data Quality',
    description: 'Evaluates statistical validity and entropy of reported data',
    weight: 0.15,
  },
  {
    id: 'reward_anomaly',
    name: 'Reward Anomaly',
    description: 'Flags nodes with reward-to-contribution ratios outside normal bounds',
    weight: 0.05,
  },
] as const

export const MOCK_STATS = {
  totalNodes: 254240,
  flagsLast24h: 1847,
  coordFarmsDetected: 312,
  meanIntegrityScore: 78.4,
  attestationsOnChain: 4821903,
}

export const MOCK_NETWORK_HEALTH = [
  { network: 'hivemapper', totalNodes: 142800, meanScore: 81.2, flaggedPct: 4.2, trend: 'up' as const },
  { network: 'geodnet', totalNodes: 8240, meanScore: 91.7, flaggedPct: 1.1, trend: 'up' as const },
  { network: 'weatherxm', totalNodes: 7600, meanScore: 76.3, flaggedPct: 8.7, trend: 'down' as const },
  { network: 'dimo', totalNodes: 92500, meanScore: 69.8, flaggedPct: 12.4, trend: 'down' as const },
  { network: 'nubila', totalNodes: 3100, meanScore: 84.1, flaggedPct: 2.9, trend: 'up' as const },
]

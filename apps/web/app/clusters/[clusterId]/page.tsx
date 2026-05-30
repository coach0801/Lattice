'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, AlertTriangle, Users, Network, Shield } from 'lucide-react'
import { NodeTable, type NodeRow } from '@/components/NodeTable'
import { FlagCard, type FlagData } from '@/components/FlagCard'
import { NETWORKS, DETECTORS } from '@/lib/constants'
import { formatNumber, mockScore, getScoreColor, cn, timeAgo } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────
interface ClusterDetail {
  clusterId: string
  memberCount: number
  networksInvolved: string[]
  confidence: number
  firstDetected: Date
  lastActivity: Date
  status: 'active' | 'investigating' | 'resolved'
  members: NodeRow[]
  evidenceFlags: FlagData[]
  detectorTriggered: string[]
  totalRewardsAtRisk: number
  summary: string
}

// ── Mock generator ─────────────────────────────────────────────────────────────
function generateClusterDetail(clusterId: string): ClusterDetail {
  const allSlugs = NETWORKS.map((n) => n.slug)
  const shuffled = [...allSlugs].sort(() => Math.random() - 0.5)
  const networkCount = 1 + Math.floor(Math.random() * 3)
  const networksInvolved = shuffled.slice(0, networkCount)
  const confidence = 0.75 + Math.random() * 0.24
  const memberCount = Math.floor(Math.random() * 800) + 50

  const members: NodeRow[] = Array.from({ length: Math.min(memberCount, 40) }, (_, i) => {
    const network = networksInvolved[i % networksInvolved.length]
    const nodeId = `${network}-${clusterId}-node-${String(i + 1).padStart(4, '0')}`
    const score = Math.max(0, Math.min(50, mockScore(nodeId) % 50))
    return {
      nodeId,
      network,
      ownerWallet: `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      score,
      flagCount: Math.floor(Math.random() * 8) + 1,
      lastSeen: new Date(Date.now() - Math.random() * 86400000 * 7),
      isOnline: Math.random() > 0.3,
    }
  })

  const detectorTriggered = DETECTORS.filter(() => Math.random() > 0.4).map((d) => d.id)

  const evidenceFlags: FlagData[] = detectorTriggered.slice(0, 4).map((detectorId, i) => ({
    id: `cluster-flag-${clusterId}-${i}`,
    detectorId,
    nodeId: members[i]?.nodeId ?? `unknown-${i}`,
    network: networksInvolved[0],
    confidence: 0.7 + Math.random() * 0.29,
    evidenceSummary: (() => {
      switch (detectorId) {
        case 'spatial_clustering':
          return `${memberCount} nodes concentrated within a ${(Math.random() * 5 + 1).toFixed(1)}km radius, far exceeding expected density.`
        case 'wallet_graph':
          return `All wallets trace back to ${Math.floor(Math.random() * 5) + 2} funding sources within 3 hops.`
        case 'temporal_sync':
          return `${Math.floor(memberCount * 0.6)} nodes registered within a ${Math.floor(Math.random() * 30) + 5}-minute window.`
        case 'hardware_fingerprint':
          return `Only ${Math.floor(Math.random() * 8) + 2} unique hardware fingerprints across all ${memberCount} nodes.`
        default:
          return `Anomalous pattern detected by ${DETECTORS.find((d) => d.id === detectorId)?.name}.`
      }
    })(),
    detectedAt: new Date(Date.now() - Math.random() * 86400000 * 30),
    resolved: false,
  }))

  return {
    clusterId,
    memberCount,
    networksInvolved,
    confidence,
    firstDetected: new Date(Date.now() - Math.random() * 86400000 * 60),
    lastActivity: new Date(Date.now() - Math.random() * 86400000 * 2),
    status: confidence > 0.9 ? 'active' : 'investigating',
    members,
    evidenceFlags,
    detectorTriggered,
    totalRewardsAtRisk: Math.floor(Math.random() * 200000) + 10000,
    summary: `This cluster was identified through correlated ${detectorTriggered.slice(0, 2).map((d) => DETECTORS.find((det) => det.id === d)?.name).join(' and ')} signals. Member nodes share infrastructure patterns consistent with a coordinated reward-farming operation spanning ${networkCount} DePIN network${networkCount > 1 ? 's' : ''}.`,
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ClusterDetailPage() {
  const params = useParams()
  const clusterId = params.clusterId as string

  const [cluster, setCluster] = useState<ClusterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeNetwork, setActiveNetwork] = useState<string>('all')

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => {
      const data = generateClusterDetail(decodeURIComponent(clusterId))
      setCluster(data)
      setActiveNetwork('all')
      setLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [clusterId])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-indigo-400 mr-3" />
        <span className="text-gray-500">Loading cluster data…</span>
      </div>
    )
  }

  if (!cluster) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Cluster not found.</p>
        <Link href="/clusters" className="text-indigo-400 hover:underline mt-4 inline-block">
          ← Back to Clusters
        </Link>
      </div>
    )
  }

  const confColor =
    cluster.confidence >= 0.9 ? '#ef4444' : cluster.confidence >= 0.75 ? '#f97316' : '#eab308'

  const filteredMembers =
    activeNetwork === 'all'
      ? cluster.members
      : cluster.members.filter((m) => m.network === activeNetwork)

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Back nav */}
      <Link
        href="/clusters"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={14} /> Cluster Explorer
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-red-500/25 bg-red-950/10 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/25 flex items-center justify-center">
                <AlertTriangle size={16} className="text-red-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest">Coordinated Farm Cluster</p>
                <h1 className="text-xl font-bold text-white font-mono">{cluster.clusterId}</h1>
              </div>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">{cluster.summary}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-gray-600 mb-1">Confidence</p>
            <p className="text-3xl font-bold font-mono" style={{ color: confColor }}>
              {(cluster.confidence * 100).toFixed(0)}%
            </p>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border mt-1',
                cluster.status === 'active'
                  ? 'bg-red-500/10 border-red-500/25 text-red-400'
                  : 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400'
              )}
            >
              {cluster.status === 'active' ? '● Active' : '◐ Investigating'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Member Nodes', value: formatNumber(cluster.memberCount), icon: Users, accent: '#ef4444' },
          { label: 'Networks Involved', value: String(cluster.networksInvolved.length), icon: Network, accent: '#6366f1' },
          { label: 'Detectors Triggered', value: String(cluster.detectorTriggered.length), icon: Shield, accent: '#f97316' },
          { label: 'Last Activity', value: timeAgo(cluster.lastActivity), icon: AlertTriangle, accent: '#eab308' },
        ].map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="rounded-xl border border-[#1e1e2e] bg-[#111118] px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} style={{ color: accent }} />
              <p className="text-xs text-gray-500">{label}</p>
            </div>
            <p className="text-lg font-bold font-mono text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Evidence */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-white mb-4">Evidence Summary</h2>

        {/* Detectors triggered */}
        <div className="flex flex-wrap gap-2 mb-4">
          {cluster.detectorTriggered.map((detId) => {
            const detector = DETECTORS.find((d) => d.id === detId)
            return (
              <div
                key={detId}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-red-500/20 bg-red-500/10 text-red-400 text-xs font-medium"
              >
                <AlertTriangle size={10} />
                {detector?.name ?? detId}
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cluster.evidenceFlags.map((flag) => (
            <FlagCard key={flag.id} flag={flag} />
          ))}
        </div>
      </div>

      {/* Networks involved */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white mb-3">Member Nodes</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setActiveNetwork('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
              activeNetwork === 'all'
                ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'
                : 'text-gray-500 border-[#1e1e2e] hover:text-white'
            )}
          >
            All ({cluster.members.length})
          </button>
          {cluster.networksInvolved.map((slug) => {
            const net = NETWORKS.find((n) => n.slug === slug)
            const count = cluster.members.filter((m) => m.network === slug).length
            return (
              <button
                key={slug}
                onClick={() => setActiveNetwork(slug)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  activeNetwork === slug
                    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'
                    : 'text-gray-500 border-[#1e1e2e] hover:text-white'
                )}
              >
                {net?.icon} {net?.name ?? slug} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Member nodes table */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] overflow-hidden">
        <NodeTable
          nodes={filteredMembers}
          showNetwork={activeNetwork === 'all'}
        />
        {cluster.memberCount > cluster.members.length && (
          <div className="px-5 py-3 border-t border-[#1e1e2e] text-xs text-gray-600 text-center">
            Showing {cluster.members.length} of {formatNumber(cluster.memberCount)} members
          </div>
        )}
      </div>
    </div>
  )
}

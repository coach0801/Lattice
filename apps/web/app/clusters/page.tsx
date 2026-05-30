'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, ChevronRight, Network, Calendar, Shield } from 'lucide-react'
import { NETWORKS } from '@/lib/constants'
import { formatNumber, timeAgo, cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────
interface ClusterRow {
  clusterId: string
  memberCount: number
  networksInvolved: string[]
  confidence: number
  firstDetected: Date
  totalRewardsAtRisk: number
  status: 'active' | 'investigating' | 'resolved'
}

// ── Mock data ──────────────────────────────────────────────────────────────────
function generateMockClusters(count = 20): ClusterRow[] {
  const allSlugs = NETWORKS.map((n) => n.slug)
  const statuses: ClusterRow['status'][] = ['active', 'investigating', 'resolved']
  return Array.from({ length: count }, (_, i) => {
    const networkCount = 1 + Math.floor(Math.random() * 3)
    const shuffled = [...allSlugs].sort(() => Math.random() - 0.5)
    const networksInvolved = shuffled.slice(0, networkCount)
    const confidence = 0.6 + Math.random() * 0.39
    return {
      clusterId: `FARM-${String(i + 1).padStart(4, '0')}`,
      memberCount: Math.floor(Math.random() * 1500) + 20,
      networksInvolved,
      confidence,
      firstDetected: new Date(Date.now() - Math.random() * 86400000 * 90),
      totalRewardsAtRisk: Math.floor(Math.random() * 500000) + 5000,
      status: statuses[Math.floor(Math.random() * 3)],
    }
  })
}

const STATUS_CONFIG = {
  active: { label: 'Active', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/25' },
  investigating: { label: 'Investigating', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/25' },
  resolved: { label: 'Resolved', bg: 'bg-gray-800', text: 'text-gray-500', border: 'border-gray-700' },
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ClustersPage() {
  const [clusters, setClusters] = useState<ClusterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'investigating' | 'resolved'>('all')

  useEffect(() => {
    const timer = setTimeout(() => {
      setClusters(generateMockClusters(25))
      setLoading(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [])

  const filtered =
    filter === 'all' ? clusters : clusters.filter((c) => c.status === filter)

  const activeClusters = clusters.filter((c) => c.status === 'active').length
  const totalMembers = clusters.reduce((s, c) => s + c.memberCount, 0)
  const highConfidence = clusters.filter((c) => c.confidence >= 0.85).length

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-red-400 font-semibold uppercase tracking-widest mb-2">
          Cluster Explorer
        </p>
        <h1 className="text-3xl font-bold text-white mb-3">Coordinated Farm Clusters</h1>
        <p className="text-gray-500 max-w-xl text-sm">
          Groups of nodes exhibiting coordinated Sybil behavior, detected by cross-network
          pattern analysis. Each cluster represents a potential reward-farming operation.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total Clusters', value: loading ? '…' : formatNumber(clusters.length), icon: Network, accent: '#6366f1' },
          { label: 'Active Clusters', value: loading ? '…' : formatNumber(activeClusters), icon: AlertTriangle, accent: '#ef4444' },
          { label: 'Nodes Involved', value: loading ? '…' : formatNumber(totalMembers), icon: Shield, accent: '#f97316' },
          { label: 'High Confidence', value: loading ? '…' : formatNumber(highConfidence), icon: Shield, accent: '#8b5cf6' },
        ].map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="rounded-xl border border-[#1e1e2e] bg-[#111118] px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={13} style={{ color: accent }} />
              <p className="text-xs text-gray-500">{label}</p>
            </div>
            <p className="text-xl font-bold font-mono text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-5">
        {(['all', 'active', 'investigating', 'resolved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
              filter === f
                ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25'
                : 'text-gray-500 hover:text-white border border-transparent hover:border-[#1e1e2e]'
            )}
          >
            {f}
            {f !== 'all' && (
              <span className="ml-1.5 text-gray-600">
                ({clusters.filter((c) => c.status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Cluster ID</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Members</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Networks</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Confidence</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">First Detected</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-600 text-sm">
                    <RefreshCw size={16} className="inline animate-spin mr-2" />
                    Loading clusters…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-600 text-sm">
                    No clusters found for this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((cluster) => {
                  const statusCfg = STATUS_CONFIG[cluster.status]
                  const confColor =
                    cluster.confidence >= 0.9
                      ? '#ef4444'
                      : cluster.confidence >= 0.75
                      ? '#f97316'
                      : '#eab308'
                  return (
                    <tr key={cluster.clusterId} className="hover:bg-[#0a0a0f] transition-colors group">
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm font-semibold text-white">
                          {cluster.clusterId}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-sm text-gray-300">
                        {formatNumber(cluster.memberCount)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {cluster.networksInvolved.map((slug) => {
                            const net = NETWORKS.find((n) => n.slug === slug)
                            return (
                              <span
                                key={slug}
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: `${net?.color ?? '#6366f1'}15`,
                                  color: net?.color ?? '#6366f1',
                                  border: `1px solid ${net?.color ?? '#6366f1'}25`,
                                }}
                              >
                                {net?.icon} {net?.name ?? slug}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${cluster.confidence * 100}%`, backgroundColor: confColor }}
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold" style={{ color: confColor }}>
                            {(cluster.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            'text-xs font-medium px-2.5 py-1 rounded-full border',
                            statusCfg.bg,
                            statusCfg.text,
                            statusCfg.border
                          )}
                        >
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-xs text-gray-500">
                        {timeAgo(cluster.firstDetected)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/clusters/${cluster.clusterId}`}
                          className="inline-flex items-center gap-1 text-xs text-gray-600 group-hover:text-indigo-400 transition-colors font-medium"
                        >
                          View <ChevronRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

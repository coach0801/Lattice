'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { NodeTable, type NodeRow } from '@/components/NodeTable'
import { FlagCard, type FlagData } from '@/components/FlagCard'
import { ScoreBadge } from '@/components/ScoreBadge'
import { NETWORKS, SCORE_BANDS, DETECTORS } from '@/lib/constants'
import { formatNumber, formatPct, getScoreColor, mockScore, timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── Mock data generators ───────────────────────────────────────────────────────
function generateMockNodes(network: string, count = 20): NodeRow[] {
  return Array.from({ length: count }, (_, i) => {
    const nodeId = `${network}-node-${String(i + 1).padStart(6, '0')}`
    const score = mockScore(nodeId)
    return {
      nodeId,
      network,
      ownerWallet: `0x${Math.random().toString(16).slice(2, 42)}`,
      score,
      flagCount: score < 30 ? Math.floor(Math.random() * 8) + 3 : score < 60 ? Math.floor(Math.random() * 3) : 0,
      lastSeen: new Date(Date.now() - Math.random() * 86400000 * 3),
      isOnline: Math.random() > 0.15,
    }
  })
}

function generateMockFlags(network: string, count = 8): FlagData[] {
  return Array.from({ length: count }, (_, i) => {
    const detector = DETECTORS[i % DETECTORS.length]
    const confidence = 0.6 + Math.random() * 0.35
    return {
      id: `flag-${network}-${i}`,
      detectorId: detector.id,
      nodeId: `${network}-node-${String(Math.floor(Math.random() * 1000)).padStart(6, '0')}`,
      network,
      confidence,
      evidenceSummary:
        detector.id === 'spatial_clustering'
          ? `Node GPS coordinates overlap with ${Math.floor(Math.random() * 10) + 2} neighbors within 50m radius.`
          : detector.id === 'wallet_graph'
          ? `Wallet funded from same source as ${Math.floor(Math.random() * 5) + 1} other flagged nodes.`
          : detector.id === 'temporal_sync'
          ? `Node came online within 3-minute window alongside ${Math.floor(Math.random() * 20) + 5} correlated nodes.`
          : `Anomalous ${detector.name.toLowerCase()} pattern detected with ${(confidence * 100).toFixed(0)}% confidence.`,
      detectedAt: new Date(Date.now() - Math.random() * 86400000 * 7),
      resolved: Math.random() > 0.8,
    }
  })
}

function generateScoreDistribution(nodes: NodeRow[]) {
  const counts = { Clean: 0, Watch: 0, Suspicious: 0, Sybil: 0 }
  nodes.forEach((n) => {
    const band = SCORE_BANDS.find((b) => n.score >= b.min && n.score <= b.max)
    if (band) {
      const key = band.label === 'High-Confidence Sybil' ? 'Sybil' : band.label
      counts[key as keyof typeof counts]++
    }
  })
  return [
    { name: 'Clean', count: counts.Clean, color: '#22c55e' },
    { name: 'Watch', count: counts.Watch, color: '#eab308' },
    { name: 'Suspicious', count: counts.Suspicious, color: '#f97316' },
    { name: 'Sybil', count: counts.Sybil, color: '#ef4444' },
  ]
}

// ── Custom Recharts tooltip ────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs">
      <p className="text-white font-semibold">{label}</p>
      <p className="text-gray-400">{payload[0].value} nodes</p>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function NetworkDetailPage() {
  const params = useParams()
  const networkSlug = params.network as string

  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [flags, setFlags] = useState<FlagData[]>([])
  const [loading, setLoading] = useState(true)

  const meta = NETWORKS.find((n) => n.slug === networkSlug)

  useEffect(() => {
    setLoading(true)
    // Simulate async fetch
    const timer = setTimeout(() => {
      setNodes(generateMockNodes(networkSlug, 30))
      setFlags(generateMockFlags(networkSlug, 10))
      setLoading(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [networkSlug])

  if (!meta) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Network &quot;{networkSlug}&quot; not found.</p>
        <Link href="/networks" className="text-indigo-400 hover:underline mt-4 inline-block">
          ← Back to Networks
        </Link>
      </div>
    )
  }

  const meanScore = nodes.length
    ? nodes.reduce((s, n) => s + n.score, 0) / nodes.length
    : 0
  const flaggedCount = nodes.filter((n) => n.score < 60).length
  const scoreColor = getScoreColor(meanScore)
  const scoreDistribution = generateScoreDistribution(nodes)
  const topFlagged = [...nodes].sort((a, b) => a.score - b.score).slice(0, 20)

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Back nav */}
      <Link
        href="/networks"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={14} /> Networks
      </Link>

      {/* Header card */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-6 mb-6 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-5"
          style={{ background: `radial-gradient(circle at 80% 50%, ${meta.color}, transparent 60%)` }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
              style={{ backgroundColor: `${meta.color}15`, border: `1px solid ${meta.color}25` }}
            >
              {meta.icon}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{meta.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{meta.description}</p>
            </div>
          </div>

          {/* Overall health */}
          <div className="text-right">
            <p className="text-xs text-gray-600 mb-1">Network Integrity Score</p>
            <div className="flex items-center gap-3 justify-end">
              <div className="h-2 w-32 rounded-full bg-[#1e1e2e] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${meanScore}%`, backgroundColor: scoreColor }}
                />
              </div>
              <span className="text-2xl font-bold font-mono" style={{ color: scoreColor }}>
                {loading ? '—' : meanScore.toFixed(1)}
              </span>
            </div>
            {!loading && <ScoreBadge score={Math.round(meanScore)} showScore={false} className="mt-2" />}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total Nodes', value: loading ? '…' : formatNumber(nodes.length) },
          { label: 'Flagged Nodes', value: loading ? '…' : formatNumber(flaggedCount), accent: '#ef4444' },
          { label: 'Flagged %', value: loading ? '…' : formatPct(nodes.length ? (flaggedCount / nodes.length) * 100 : 0), accent: '#f97316' },
          { label: 'Active Flags', value: loading ? '…' : formatNumber(flags.filter((f) => !f.resolved).length), accent: '#eab308' },
        ].map(({ label, value, accent }) => (
          <div key={label} className="rounded-xl border border-[#1e1e2e] bg-[#111118] px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-xl font-bold font-mono" style={{ color: accent ?? '#ffffff' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Score distribution chart */}
        <div className="lg:col-span-2 rounded-xl border border-[#1e1e2e] bg-[#111118] p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Score Distribution</h2>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
              <RefreshCw size={16} className="animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scoreDistribution} barSize={40}>
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {scoreDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Band breakdown */}
        <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Band Breakdown</h2>
          <div className="space-y-3">
            {scoreDistribution.map((band) => {
              const pct = nodes.length ? (band.count / nodes.length) * 100 : 0
              return (
                <div key={band.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: band.color }}>{band.name}</span>
                    <span className="text-xs font-mono text-gray-500">
                      {loading ? '…' : `${band.count} (${pct.toFixed(0)}%)`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: band.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Top flagged nodes */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] mb-8 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Top Flagged Nodes</h2>
          <span className="text-xs text-gray-600">Sorted by lowest score</span>
        </div>
        {loading ? (
          <div className="py-16 flex items-center justify-center text-gray-600 text-sm">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading nodes…
          </div>
        ) : (
          <NodeTable nodes={topFlagged} network={networkSlug} />
        )}
      </div>

      {/* Recent flags feed */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-4">Recent Detection Flags</h2>
        {loading ? (
          <div className="text-gray-600 text-sm py-8 text-center">
            <RefreshCw size={16} className="animate-spin inline mr-2" /> Loading flags…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {flags.slice(0, 6).map((flag) => (
              <FlagCard key={flag.id} flag={flag} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

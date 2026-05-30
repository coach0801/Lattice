'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { ArrowLeft, RefreshCw, MapPin, Clock, Cpu, Activity, Wifi } from 'lucide-react'
import { ScoreGauge } from '@/components/ScoreGauge'
import { FlagCard, type FlagData } from '@/components/FlagCard'
import { NETWORKS, DETECTORS } from '@/lib/constants'
import {
  formatAddress,
  getScoreColor,
  getScoreBand,
  mockScore,
  timeAgo,
  confidenceToSeverity,
} from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────
interface SubScore {
  detectorId: string
  score: number
  confidence: number
  triggered: boolean
  detail: string
}

interface ScoreHistory {
  date: string
  score: number
}

interface NodeDetail {
  nodeId: string
  network: string
  ownerWallet: string
  score: number
  lat: number
  lng: number
  firstSeen: Date
  lastSeen: Date
  isOnline: boolean
  subScores: SubScore[]
  flags: FlagData[]
  scoreHistory: ScoreHistory[]
  hardwareModel: string
  firmwareVersion: string
  uptimePct: number
}

// ── Mock generator ─────────────────────────────────────────────────────────────
function generateNodeDetail(nodeId: string, network: string): NodeDetail {
  const score = mockScore(nodeId)
  const now = Date.now()

  const subScores: SubScore[] = DETECTORS.map((d) => {
    const detectorScore = Math.max(0, Math.min(100, score + (Math.random() - 0.5) * 30))
    const triggered = detectorScore < 60
    return {
      detectorId: d.id,
      score: Math.round(detectorScore),
      confidence: 0.5 + Math.random() * 0.45,
      triggered,
      detail: triggered
        ? `${d.name} anomaly detected — score ${detectorScore.toFixed(0)}/100`
        : `No anomalies — within normal bounds`,
    }
  })

  const flags: FlagData[] = subScores
    .filter((s) => s.triggered)
    .map((s, i) => ({
      id: `flag-${nodeId}-${i}`,
      detectorId: s.detectorId,
      nodeId,
      network,
      confidence: s.confidence,
      evidenceSummary: s.detail,
      detectedAt: new Date(now - Math.random() * 86400000 * 14),
      resolved: Math.random() > 0.7,
    }))

  const scoreHistory: ScoreHistory[] = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now - (29 - i) * 86400000)
    const drift = (Math.random() - 0.5) * 12
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: Math.max(0, Math.min(100, score + drift)),
    }
  })

  return {
    nodeId,
    network,
    ownerWallet: `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    score,
    lat: 37.7749 + (Math.random() - 0.5) * 10,
    lng: -122.4194 + (Math.random() - 0.5) * 10,
    firstSeen: new Date(now - Math.random() * 86400000 * 180),
    lastSeen: new Date(now - Math.random() * 3600000),
    isOnline: Math.random() > 0.15,
    subScores,
    flags,
    scoreHistory,
    hardwareModel: ['DataPlus Gen2', 'SensorNode Pro', 'FieldKit v3', 'EdgeSensor 4G'][Math.floor(Math.random() * 4)],
    firmwareVersion: `v${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 9)}`,
    uptimePct: 70 + Math.random() * 29,
  }
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function ScoreTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const score = payload[0].value
  const color = getScoreColor(score)
  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs">
      <p className="text-gray-400">{label}</p>
      <p className="font-bold font-mono" style={{ color }}>Score: {score.toFixed(1)}</p>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function NodeDetailPage() {
  const params = useParams()
  const networkSlug = params.network as string
  const nodeId = params.nodeId as string

  const [node, setNode] = useState<NodeDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const meta = NETWORKS.find((n) => n.slug === networkSlug)

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => {
      setNode(generateNodeDetail(decodeURIComponent(nodeId), networkSlug))
      setLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [nodeId, networkSlug])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-indigo-400 mr-3" />
        <span className="text-gray-500">Loading node data…</span>
      </div>
    )
  }

  if (!node || !meta) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Node not found.</p>
        <Link href={`/networks/${networkSlug}`} className="text-indigo-400 hover:underline mt-4 inline-block">
          ← Back to {networkSlug}
        </Link>
      </div>
    )
  }

  const scoreColor = getScoreColor(node.score)
  const band = getScoreBand(node.score)

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-6">
        <Link href="/networks" className="hover:text-white transition-colors">Networks</Link>
        <span>/</span>
        <Link href={`/networks/${networkSlug}`} className="hover:text-white transition-colors capitalize">
          {meta.name}
        </Link>
        <span>/</span>
        <span className="text-gray-400 font-mono text-xs">{decodeURIComponent(nodeId)}</span>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
          {/* Score gauge */}
          <div className="shrink-0">
            <ScoreGauge score={node.score} size={160} />
          </div>

          {/* Node info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{meta.icon}</span>
              <span className="text-sm text-gray-500 capitalize">{meta.name}</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border',
                  node.isOnline
                    ? 'bg-green-500/10 border-green-500/25 text-green-400'
                    : 'bg-gray-800 border-gray-700 text-gray-500'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    node.isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-600'
                  )}
                />
                {node.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            <h1 className="text-xl font-bold text-white font-mono mb-1">
              {decodeURIComponent(nodeId)}
            </h1>

            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-sm text-gray-500">
              <div className="flex items-center gap-1.5">
                <Cpu size={13} />
                <span className="font-mono text-xs">{formatAddress(node.ownerWallet)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin size={13} />
                <span className="text-xs">
                  {node.lat.toFixed(4)}, {node.lng.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={13} />
                <span className="text-xs">Last seen {timeAgo(node.lastSeen)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity size={13} />
                <span className="text-xs">{node.uptimePct.toFixed(1)}% uptime</span>
              </div>
            </div>
          </div>

          {/* Hardware info */}
          <div className="shrink-0 rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] p-4 text-xs space-y-2">
            <div>
              <p className="text-gray-600 mb-0.5">Hardware</p>
              <p className="text-white font-medium">{node.hardwareModel}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-0.5">Firmware</p>
              <p className="text-gray-300 font-mono">{node.firmwareVersion}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-0.5">First Seen</p>
              <p className="text-gray-300">{new Date(node.firstSeen).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Score history chart */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 mb-6">
        <h2 className="text-sm font-semibold text-white mb-4">Score History — Last 30 Days</h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={node.scoreHistory}>
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip content={<ScoreTooltip />} />
            {/* Band reference lines */}
            <ReferenceLine y={85} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.3} />
            <ReferenceLine y={60} stroke="#eab308" strokeDasharray="4 4" strokeOpacity={0.3} />
            <ReferenceLine y={30} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.3} />
            <Line
              type="monotone"
              dataKey="score"
              stroke={scoreColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: scoreColor }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Sub-scores */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-white mb-4">Detector Sub-Scores</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {node.subScores.map((sub) => {
            const detector = DETECTORS.find((d) => d.id === sub.detectorId)
            const color = getScoreColor(sub.score)
            return (
              <div
                key={sub.detectorId}
                className={cn(
                  'rounded-xl border p-4 transition-all',
                  sub.triggered
                    ? 'border-orange-500/25 bg-orange-950/10'
                    : 'border-[#1e1e2e] bg-[#111118]'
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{detector?.name}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{detector?.description}</p>
                  </div>
                  <span
                    className="text-lg font-bold font-mono shrink-0 ml-2"
                    style={{ color }}
                  >
                    {sub.score}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${sub.score}%`, backgroundColor: color }}
                  />
                </div>
                <p className="text-xs text-gray-500">{sub.detail}</p>
                {sub.triggered && (
                  <p className="text-xs text-orange-400 mt-1 font-medium">
                    ⚠ Triggered · {(sub.confidence * 100).toFixed(0)}% confidence
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Flag history */}
      {node.flags.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-4">
            Flag History ({node.flags.length})
          </h2>
          <div className="space-y-3">
            {node.flags
              .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
              .map((flag) => (
                <FlagCard key={flag.id} flag={flag} />
              ))}
          </div>
        </div>
      )}

      {node.flags.length === 0 && (
        <div className="rounded-xl border border-green-500/20 bg-green-950/10 p-6 text-center">
          <div className="w-10 h-10 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center mx-auto mb-3">
            <Wifi size={18} className="text-green-400" />
          </div>
          <p className="text-sm font-semibold text-green-400">No flags detected</p>
          <p className="text-xs text-gray-600 mt-1">This node has a clean integrity record</p>
        </div>
      )}
    </div>
  )
}

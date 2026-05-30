'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from 'recharts'
import {
  LayoutDashboard,
  Network,
  Shield,
  Settings,
  Bell,
  Activity,
  Cpu,
  BarChart3,
  ChevronRight,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wallet,
  ExternalLink,
} from 'lucide-react'
import { DETECTORS, NETWORKS, SCORE_BANDS } from '@/lib/constants'
import { formatNumber, formatPct, getScoreColor, timeAgo, cn } from '@/lib/utils'

// ── Mock data ──────────────────────────────────────────────────────────────────
const DETECTOR_PERFORMANCE = DETECTORS.map((d) => ({
  name: d.name.split(' ')[0],
  precision: 0.7 + Math.random() * 0.28,
  recall: 0.6 + Math.random() * 0.35,
  f1: 0.65 + Math.random() * 0.3,
  flags24h: Math.floor(Math.random() * 400) + 20,
}))

const RECENT_WEBHOOKS = Array.from({ length: 8 }, (_, i) => ({
  id: `evt-${Date.now() - i * 30000}`,
  type: ['flag.created', 'score.updated', 'cluster.detected', 'flag.resolved'][i % 4] as string,
  network: NETWORKS[i % NETWORKS.length].slug,
  payload: `node-${String(Math.floor(Math.random() * 99999)).padStart(6, '0')}`,
  timestamp: new Date(Date.now() - i * 120000 - Math.random() * 60000),
  status: Math.random() > 0.1 ? ('delivered' as const) : ('failed' as const),
}))

const THRESHOLD_CONFIG = [
  { network: 'hivemapper', threshold: 70, autoFlag: true, webhookEnabled: true },
  { network: 'geodnet', threshold: 75, autoFlag: true, webhookEnabled: false },
  { network: 'weatherxm', threshold: 65, autoFlag: false, webhookEnabled: true },
  { network: 'dimo', threshold: 60, autoFlag: true, webhookEnabled: true },
  { network: 'nubila', threshold: 70, autoFlag: false, webhookEnabled: false },
]

const OVERVIEW_STATS = [
  { label: 'Nodes Managed', value: '2,847', icon: Cpu, accent: '#6366f1' },
  { label: 'Active Flags', value: '143', icon: AlertTriangle, accent: '#ef4444' },
  { label: 'Clean Nodes', value: '2,493', icon: CheckCircle2, accent: '#22c55e' },
  { label: 'Webhooks Delivered', value: '99.2%', icon: Zap, accent: '#8b5cf6' },
]

type NavItem = 'overview' | 'detectors' | 'webhooks' | 'thresholds' | 'settings'

const NAV_ITEMS: { id: NavItem; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'detectors', label: 'Detectors', icon: Shield },
  { id: 'webhooks', label: 'Webhooks', icon: Zap },
  { id: 'thresholds', label: 'Thresholds', icon: Settings },
]

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function BarTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; name: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="text-white font-semibold">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-gray-400">
          {p.name}: <span className="text-white font-mono">{(p.value * 100).toFixed(1)}%</span>
        </p>
      ))}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [activeNav, setActiveNav] = useState<NavItem>('overview')

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-[#1e1e2e] bg-[#0a0a0f] pt-6 shrink-0">
        {/* Mock wallet */}
        <div className="mx-3 mb-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={13} className="text-indigo-400" />
            <span className="text-xs text-indigo-400 font-medium">Connected</span>
          </div>
          <p className="text-xs font-mono text-gray-300">0x1a2b…f3d4</p>
        </div>

        <nav className="px-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveNav(id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                activeNav === id
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
                  : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-auto px-3 pb-6 space-y-0.5">
          <Link
            href="/networks"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-400 hover:bg-white/5 transition-all"
          >
            <Network size={15} />
            Networks
            <ExternalLink size={11} className="ml-auto" />
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Mobile nav tabs */}
        <div className="md:hidden flex gap-2 mb-6 overflow-x-auto pb-2">
          {NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveNav(id)}
              className={cn(
                'shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all border',
                activeNav === id
                  ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'
                  : 'text-gray-500 border-[#1e1e2e]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {activeNav === 'overview' && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">Operator Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">Monitoring 2,847 nodes across 5 networks</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              {OVERVIEW_STATS.map(({ label, value, icon: Icon, accent }) => (
                <div key={label} className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-xl opacity-10" style={{ backgroundColor: accent }} />
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: `${accent}20`, border: `1px solid ${accent}30` }}>
                    <Icon size={13} style={{ color: accent }} />
                  </div>
                  <p className="text-xl font-bold font-mono text-white">{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Per-network score bars */}
            <h2 className="text-sm font-semibold text-white mb-3">Network Health Summary</h2>
            <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] divide-y divide-[#1e1e2e] mb-6">
              {NETWORKS.map((net) => {
                const score = 65 + Math.random() * 30
                const color = getScoreColor(score)
                return (
                  <div key={net.slug} className="flex items-center gap-4 px-5 py-3.5">
                    <span className="text-lg w-6 text-center">{net.icon}</span>
                    <span className="text-sm font-medium text-white w-28">{net.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#1e1e2e] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-sm font-bold font-mono w-10 text-right" style={{ color }}>
                      {score.toFixed(0)}
                    </span>
                    <Link
                      href={`/networks/${net.slug}`}
                      className="text-xs text-gray-600 hover:text-indigo-400 transition-colors"
                    >
                      <ChevronRight size={14} />
                    </Link>
                  </div>
                )
              })}
            </div>

            {/* Recent webhook events preview */}
            <h2 className="text-sm font-semibold text-white mb-3">Recent Events</h2>
            <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] overflow-hidden">
              {RECENT_WEBHOOKS.slice(0, 5).map((evt) => {
                const net = NETWORKS.find((n) => n.slug === evt.network)
                const typeColor = evt.type.includes('flag') ? '#ef4444' : evt.type.includes('cluster') ? '#f97316' : '#6366f1'
                return (
                  <div key={evt.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e2e] last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: typeColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white font-mono">{evt.type}</span>
                        <span className="text-xs text-gray-600">{net?.icon} {net?.name}</span>
                      </div>
                      <p className="text-xs text-gray-600 font-mono truncate">{evt.payload}</p>
                    </div>
                    <span className="text-xs text-gray-600 shrink-0">{timeAgo(evt.timestamp)}</span>
                  </div>
                )
              })}
              <div className="px-4 py-2 border-t border-[#1e1e2e]">
                <button onClick={() => setActiveNav('webhooks')} className="text-xs text-indigo-400 hover:text-indigo-300">
                  View all events →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DETECTORS ── */}
        {activeNav === 'detectors' && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">Detector Performance</h1>
              <p className="text-sm text-gray-500 mt-1">Precision, recall, and F1 scores across all active detectors</p>
            </div>

            {/* Chart */}
            <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 mb-6">
              <h2 className="text-sm font-semibold text-white mb-4">Precision vs Recall (30-day rolling)</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={DETECTOR_PERFORMANCE} barGap={4}>
                  <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1]} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="precision" name="Precision" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={16} />
                  <Bar dataKey="recall" name="Recall" fill="#8b5cf6" radius={[3, 3, 0, 0]} barSize={16} />
                  <Bar dataKey="f1" name="F1" fill="#a855f7" radius={[3, 3, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Detector cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DETECTORS.map((d, i) => {
                const perf = DETECTOR_PERFORMANCE[i]
                return (
                  <div key={d.id} className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{d.name}</h3>
                        <p className="text-xs text-gray-600 mt-0.5">{d.description}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-xs text-gray-600">Flags (24h)</p>
                        <p className="text-sm font-bold text-orange-400 font-mono">{perf.flags24h}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Precision', value: perf.precision, color: '#6366f1' },
                        { label: 'Recall', value: perf.recall, color: '#8b5cf6' },
                        { label: 'F1 Score', value: perf.f1, color: '#a855f7' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="rounded-lg bg-[#0a0a0f] px-2.5 py-2">
                          <p className="text-xs text-gray-600">{label}</p>
                          <p className="text-sm font-bold font-mono" style={{ color }}>
                            {(value * 100).toFixed(1)}%
                          </p>
                          <div className="h-1 rounded-full bg-[#1e1e2e] mt-1 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${value * 100}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                      <span>Weight: {(d.weight * 100).toFixed(0)}% of composite score</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── WEBHOOKS ── */}
        {activeNav === 'webhooks' && (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-white">Webhook Events</h1>
                <p className="text-sm text-gray-500 mt-1">Real-time event feed from your monitored nodes</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full">
                <Activity size={11} className="animate-pulse" />
                Live
              </div>
            </div>

            {/* Event type legend */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { type: 'flag.created', color: '#ef4444' },
                { type: 'score.updated', color: '#6366f1' },
                { type: 'cluster.detected', color: '#f97316' },
                { type: 'flag.resolved', color: '#22c55e' },
              ].map(({ type, color }) => (
                <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  {type}
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] overflow-hidden">
              {RECENT_WEBHOOKS.map((evt, idx) => {
                const net = NETWORKS.find((n) => n.slug === evt.network)
                const typeColors: Record<string, string> = {
                  'flag.created': '#ef4444',
                  'score.updated': '#6366f1',
                  'cluster.detected': '#f97316',
                  'flag.resolved': '#22c55e',
                }
                const color = typeColors[evt.type] ?? '#6366f1'
                return (
                  <div
                    key={evt.id}
                    className={cn(
                      'flex items-center gap-4 px-5 py-3.5',
                      idx < RECENT_WEBHOOKS.length - 1 && 'border-b border-[#1e1e2e]'
                    )}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span
                          className="text-xs font-semibold font-mono px-2 py-0.5 rounded border"
                          style={{ color, backgroundColor: `${color}15`, borderColor: `${color}30` }}
                        >
                          {evt.type}
                        </span>
                        <span className="text-xs text-gray-500">{net?.icon} {net?.name}</span>
                      </div>
                      <p className="text-xs text-gray-600 font-mono mt-0.5 truncate">
                        node: {evt.payload}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={cn('text-xs font-medium', evt.status === 'delivered' ? 'text-green-400' : 'text-red-400')}>
                        {evt.status}
                      </div>
                      <div className="text-xs text-gray-600">{timeAgo(evt.timestamp)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── THRESHOLDS ── */}
        {activeNav === 'thresholds' && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">Threshold Configuration</h1>
              <p className="text-sm text-gray-500 mt-1">
                Configure per-network integrity score thresholds for automated flagging and reward gating.
              </p>
            </div>

            <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#1e1e2e]">
                <div className="grid grid-cols-5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span>Network</span>
                  <span className="text-right">Threshold</span>
                  <span className="text-center">Auto-Flag</span>
                  <span className="text-center">Webhook</span>
                  <span className="text-right">Status</span>
                </div>
              </div>
              {THRESHOLD_CONFIG.map((cfg) => {
                const net = NETWORKS.find((n) => n.slug === cfg.network)
                const color = getScoreColor(cfg.threshold)
                return (
                  <div
                    key={cfg.network}
                    className="grid grid-cols-5 items-center px-5 py-4 border-b border-[#1e1e2e] last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{net?.icon}</span>
                      <span className="text-sm font-medium text-white">{net?.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${cfg.threshold}%`, backgroundColor: color }} />
                        </div>
                        <span className="text-sm font-bold font-mono" style={{ color }}>
                          {cfg.threshold}
                        </span>
                      </div>
                    </div>
                    <div className="text-center">
                      <span className={cn('text-xs font-medium', cfg.autoFlag ? 'text-green-400' : 'text-gray-600')}>
                        {cfg.autoFlag ? '✓ On' : '— Off'}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className={cn('text-xs font-medium', cfg.webhookEnabled ? 'text-indigo-400' : 'text-gray-600')}>
                        {cfg.webhookEnabled ? '✓ On' : '— Off'}
                      </span>
                    </div>
                    <div className="text-right">
                      <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                        Configure
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
              <div className="flex items-start gap-3">
                <Shield size={16} className="text-indigo-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="text-indigo-300 font-medium mb-1">On-Chain Attestation</p>
                  <p className="text-gray-500 text-xs leading-relaxed">
                    Every threshold breach and score update is signed and posted on-chain within 60 seconds.
                    Smart contracts can query the Lattice oracle for real-time reward gating decisions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

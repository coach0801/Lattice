import Link from 'next/link'
import {
  Shield,
  Network,
  Zap,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Globe,
  Cpu,
  ChevronRight,
  Lock,
  BarChart3,
} from 'lucide-react'
import { NetworkCard } from '@/components/NetworkCard'
import { NETWORKS, MOCK_STATS, MOCK_NETWORK_HEALTH, SCORE_BANDS } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────
interface StatsData {
  totalNodes: number
  flagsLast24h: number
  coordFarmsDetected: number
  meanIntegrityScore: number
  attestationsOnChain: number
}

interface NetworkHealth {
  network: string
  totalNodes: number
  meanScore: number
  flaggedPct: number
  trend: 'up' | 'down' | 'flat'
}

// ── Data fetching helpers ──────────────────────────────────────────────────────
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

async function getStats(): Promise<StatsData> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/v1/stats`, { cache: 'no-store' })
    if (!res.ok) throw new Error('stats fetch failed')
    const json = await res.json()
    const d = json.data ?? json
    return {
      totalNodes: d.total_nodes ?? d.totalNodes ?? MOCK_STATS.totalNodes,
      flagsLast24h: d.flags_24h ?? d.flagsLast24h ?? MOCK_STATS.flagsLast24h,
      coordFarmsDetected: d.clusters_active ?? d.coordFarmsDetected ?? MOCK_STATS.coordFarmsDetected,
      meanIntegrityScore: d.mean_score ?? d.meanIntegrityScore ?? MOCK_STATS.meanIntegrityScore,
      attestationsOnChain: d.attestations_total ?? d.attestationsOnChain ?? MOCK_STATS.attestationsOnChain,
    }
  } catch {
    return MOCK_STATS
  }
}

async function getNetworkHealth(): Promise<NetworkHealth[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/v1/networks`, { cache: 'no-store' })
    if (!res.ok) throw new Error('network health fetch failed')
    const json = await res.json()
    const arr: NetworkHealth[] = (json.data ?? json) as NetworkHealth[]
    if (!Array.isArray(arr) || arr.length === 0) return MOCK_NETWORK_HEALTH
    return arr.map((n) => ({
      network: n.network,
      totalNodes: (n as unknown as Record<string,number>).total_nodes ?? n.totalNodes ?? 0,
      meanScore: (n as unknown as Record<string,number>).mean_score ?? n.meanScore ?? 0,
      flaggedPct: (n as unknown as Record<string,number>).flagged_pct ?? n.flaggedPct ?? 0,
      trend: n.trend ?? 'flat',
    }))
  } catch {
    return MOCK_NETWORK_HEALTH
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  accent: string
}) {
  return (
    <div className="relative rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 overflow-hidden group hover:border-indigo-500/30 transition-all duration-200">
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accent}20`, border: `1px solid ${accent}30` }}
        >
          <Icon size={15} style={{ color: accent }} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white font-mono tracking-tight">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: accent }}>{sub}</p>}
    </div>
  )
}

function HowItWorksStep({
  step,
  icon: Icon,
  title,
  desc,
  color,
}: {
  step: number
  icon: React.ElementType
  title: string
  desc: string
  color: string
}) {
  return (
    <div className="relative flex flex-col items-start gap-3">
      {/* Connector line */}
      {step < 4 && (
        <div className="absolute left-5 top-10 w-px h-full -bottom-4 bg-gradient-to-b from-[#1e1e2e] to-transparent hidden lg:block" />
      )}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 border"
          style={{
            backgroundColor: `${color}15`,
            borderColor: `${color}30`,
          }}
        >
          <Icon size={18} style={{ color }} />
        </div>
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color }}
        >
          Step {step}
        </span>
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
    </div>
  )
}

function CaseStudyCard({
  title,
  network,
  nodesInvolved,
  confidence,
  detectors,
  summary,
  date,
}: {
  title: string
  network: string
  nodesInvolved: number
  confidence: number
  detectors: string[]
  summary: string
  date: string
}) {
  const networkMeta = NETWORKS.find((n) => n.slug === network)
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-5 hover:border-red-500/40 transition-all duration-200">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{networkMeta?.icon}</span>
            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">
              {networkMeta?.name ?? network}
            </span>
          </div>
          <h3 className="font-semibold text-white text-sm">{title}</h3>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-gray-600 mb-1">{date}</div>
          <div className="inline-flex items-center gap-1 bg-red-500/15 text-red-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-red-500/25">
            <AlertTriangle size={10} />
            {(confidence * 100).toFixed(0)}% confidence
          </div>
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-3 leading-relaxed">{summary}</p>
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <Cpu size={11} />
          {formatNumber(nodesInvolved)} nodes
        </span>
        <span className="text-gray-700">·</span>
        {detectors.map((d) => (
          <span
            key={d}
            className="bg-[#1e1e2e] text-gray-400 px-2 py-0.5 rounded-full"
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const [stats, networkHealth] = await Promise.all([getStats(), getNetworkHealth()])

  return (
    <div className="relative">
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-indigo-950/30 rounded-full blur-[120px]" />
        <div className="absolute top-[200px] right-0 w-[400px] h-[400px] bg-violet-950/20 rounded-full blur-[100px]" />
        <div className="dot-grid absolute inset-0 opacity-30" />
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative pt-20 pb-16 sm:pt-28 sm:pb-24 px-4">
        <div className="max-w-5xl mx-auto text-center">
          {/* Pre-badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-6 shadow-glow-indigo">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Testnet Live · 5 Networks · {formatNumber(stats.totalNodes)} Nodes Monitored
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.08]">
            <span className="text-white">The Trust Layer</span>
            <br />
            <span className="gradient-text-hero">for DePIN</span>
          </h1>

          {/* Sub-headline */}
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            Real-time Sybil detection across Hivemapper, GEODNET, WeatherXM, DIMO, and Nubila —
            cryptographically attested on-chain.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/networks"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 transition-all duration-150 shadow-glow-indigo group"
            >
              Explore Networks
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/clusters"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#1e1e2e] text-gray-300 font-semibold text-sm hover:border-indigo-500/40 hover:text-white hover:bg-white/5 transition-all duration-150"
            >
              View Cluster Explorer
            </Link>
          </div>

          {/* Score band legend strip */}
          <div className="mt-12 inline-flex items-center gap-1 flex-wrap justify-center">
            {SCORE_BANDS.map((band) => (
              <div
                key={band.label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium"
                style={{
                  backgroundColor: `${band.color}18`,
                  borderColor: `${band.color}30`,
                  color: band.color,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: band.color }}
                />
                {band.label === 'High-Confidence Sybil' ? 'Sybil' : band.label}
                <span className="opacity-50 font-mono">
                  {band.min}–{band.max}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE STATS BAR ────────────────────────────────────────────────────── */}
      <section className="relative px-4 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label="Total Nodes Monitored"
              value={formatNumber(stats.totalNodes)}
              icon={Globe}
              accent="#6366f1"
            />
            <StatCard
              label="Flags Issued (24h)"
              value={formatNumber(stats.flagsLast24h)}
              sub="+12% vs yesterday"
              icon={AlertTriangle}
              accent="#f97316"
            />
            <StatCard
              label="Coordinated Farms Detected"
              value={formatNumber(stats.coordFarmsDetected)}
              icon={Network}
              accent="#ef4444"
            />
            <StatCard
              label="Mean Integrity Score"
              value={stats.meanIntegrityScore.toFixed(1)}
              sub="Network-wide average"
              icon={BarChart3}
              accent="#22c55e"
            />
            <StatCard
              label="Attestations On-Chain"
              value={formatNumber(stats.attestationsOnChain)}
              icon={Lock}
              accent="#8b5cf6"
            />
          </div>
        </div>
      </section>

      {/* ── NETWORK HEALTH GRID ───────────────────────────────────────────────── */}
      <section className="relative px-4 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-xs text-indigo-400 font-semibold uppercase tracking-widest mb-1">
                Live Network Status
              </p>
              <h2 className="text-2xl font-bold text-white">Monitored DePIN Networks</h2>
            </div>
            <Link
              href="/networks"
              className="text-sm text-gray-500 hover:text-indigo-400 transition-colors flex items-center gap-1"
            >
              View all <ChevronRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {networkHealth.map((nh) => (
              <NetworkCard
                key={nh.network}
                slug={nh.network}
                totalNodes={nh.totalNodes}
                meanScore={nh.meanScore}
                flaggedPct={nh.flaggedPct}
                trend={nh.trend}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────────── */}
      <section className="relative px-4 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs text-indigo-400 font-semibold uppercase tracking-widest mb-2">
              How It Works
            </p>
            <h2 className="text-3xl font-bold text-white">
              Multi-Layer Integrity Detection
            </h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto text-sm">
              Lattice runs six orthogonal detectors in parallel, aggregates evidence into a
              composite integrity score, and attests each result on-chain.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <HowItWorksStep
              step={1}
              icon={Globe}
              title="Ingest Node Telemetry"
              desc="Raw data streams from participating DePIN networks are ingested via authenticated APIs — GPS, uptime, hardware IDs, and reward history."
              color="#6366f1"
            />
            <HowItWorksStep
              step={2}
              icon={Cpu}
              title="Run Parallel Detectors"
              desc="Six detectors analyze spatial clustering, temporal synchrony, wallet graph topology, hardware fingerprints, data quality, and reward anomalies simultaneously."
              color="#8b5cf6"
            />
            <HowItWorksStep
              step={3}
              icon={BarChart3}
              title="Compute Integrity Score"
              desc="Weighted detector outputs are aggregated into a 0–100 score. Nodes below threshold are flagged and grouped into coordinated farm clusters."
              color="#a855f7"
            />
            <HowItWorksStep
              step={4}
              icon={Lock}
              title="Attest On-Chain"
              desc="Every score update and flag is cryptographically signed and posted on-chain, creating an immutable audit trail networks can reference for reward gating."
              color="#ec4899"
            />
          </div>
        </div>
      </section>

      {/* ── CASE STUDIES ─────────────────────────────────────────────────────── */}
      <section className="relative px-4 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-xs text-red-400 font-semibold uppercase tracking-widest mb-1">
                Recent Detections
              </p>
              <h2 className="text-2xl font-bold text-white">Case Studies</h2>
            </div>
            <Link
              href="/clusters"
              className="text-sm text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
            >
              All clusters <ChevronRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CaseStudyCard
              title="Operation Ghost Map — Hivemapper Farm Cluster #88"
              network="hivemapper"
              nodesInvolved={1240}
              confidence={0.96}
              detectors={['Spatial Clustering', 'Wallet Graph', 'Temporal Sync']}
              summary="A coordinated network of 1,240 dashcam nodes submitted identical GPS traces with 99.7% spatial overlap across 8 wallets funded from a single exchange deposit. Temporal analysis revealed all nodes came online within a 4-minute window."
              date="2024-11-18"
            />
            <CaseStudyCard
              title="Phantom Weather Array — WeatherXM Farm Cluster #34"
              network="weatherxm"
              nodesInvolved={387}
              confidence={0.91}
              detectors={['Data Quality', 'Hardware Fingerprint', 'Temporal Sync']}
              summary="387 weather stations reporting identical temperature and humidity readings with zero entropy variance across stations 80km apart. Hardware attestation revealed 12 unique MAC addresses shared across all devices."
              date="2024-11-14"
            />
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ───────────────────────────────────────────────────────── */}
      <section className="relative px-4 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/50 to-violet-950/30 p-10 text-center overflow-hidden">
            <div className="absolute inset-0 bg-card-glow opacity-50" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
                <Shield size={12} />
                Integrity Infrastructure
              </div>
              <h2 className="text-3xl font-bold text-white mb-3">
                Protect Your DePIN Rewards
              </h2>
              <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
                Connect your operator wallet to see your nodes&apos; integrity scores, receive
                real-time alerts, and configure automatic reward-gating thresholds.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 transition-all duration-150 group"
                >
                  Open Dashboard
                  <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="/networks"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-indigo-500/25 text-indigo-300 font-semibold text-sm hover:bg-indigo-500/10 transition-all duration-150"
                >
                  Browse Networks
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

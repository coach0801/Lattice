import Link from 'next/link'
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'
import { NETWORKS, MOCK_NETWORK_HEALTH, SCORE_BANDS } from '@/lib/constants'
import { formatNumber, formatPct, getScoreBand, getScoreColor } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface NetworkHealth {
  network: string
  totalNodes: number
  meanScore: number
  flaggedPct: number
  trend: 'up' | 'down' | 'flat'
}

async function getNetworkHealth(): Promise<NetworkHealth[]> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const res = await fetch(`${baseUrl}/api/v1/networks`, { cache: 'no-store' })
    if (!res.ok) throw new Error('fetch failed')
    return res.json()
  } catch {
    return MOCK_NETWORK_HEALTH
  }
}

export default async function NetworksPage() {
  const networkHealth = await getNetworkHealth()

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Page header */}
      <div className="mb-10">
        <p className="text-xs text-indigo-400 font-semibold uppercase tracking-widest mb-2">
          Network Explorer
        </p>
        <h1 className="text-3xl font-bold text-white mb-3">DePIN Networks</h1>
        <p className="text-gray-500 max-w-xl">
          Browse all monitored networks, inspect integrity scores, and identify flagged nodes
          across the DePIN ecosystem.
        </p>
      </div>

      {/* Score band legend */}
      <div className="flex flex-wrap gap-2 mb-8">
        {SCORE_BANDS.map((band) => (
          <div
            key={band.label}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs"
            style={{
              backgroundColor: `${band.color}15`,
              borderColor: `${band.color}30`,
              color: band.color,
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: band.color }} />
            <span className="font-medium">
              {band.label === 'High-Confidence Sybil' ? 'Sybil' : band.label}
            </span>
            <span className="opacity-50 font-mono">{band.min}–{band.max}</span>
          </div>
        ))}
      </div>

      {/* Networks table */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] overflow-hidden mb-10">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Network</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Total Nodes</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Mean Score</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Flagged %</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {NETWORKS.map((meta) => {
                const health = networkHealth.find((h) => h.network === meta.slug)
                const score = health?.meanScore ?? 0
                const band = getScoreBand(score)
                const color = getScoreColor(score)
                const TrendIcon = health?.trend === 'up' ? TrendingUp : TrendingDown
                const trendColor = health?.trend === 'up' ? 'text-green-400' : 'text-red-400'

                return (
                  <tr key={meta.slug} className="hover:bg-[#0a0a0f] transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-xl"
                          style={{ backgroundColor: `${meta.color}15`, border: `1px solid ${meta.color}25` }}
                        >
                          {meta.icon}
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm">{meta.name}</p>
                          <p className="text-xs text-gray-600 max-w-[200px] line-clamp-1">{meta.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-gray-300">
                      {health ? formatNumber(health.totalNodes) : '—'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="w-24 h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden hidden sm:block">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${score}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="font-mono text-sm font-semibold" style={{ color }}>
                          {score.toFixed(1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border',
                          band.bgClass,
                          band.textClass,
                          band.borderClass
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                        {band.label === 'High-Confidence Sybil' ? 'Sybil' : band.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm">
                      {health ? (
                        <span
                          className={
                            (health.flaggedPct ?? 0) > 10
                              ? 'text-red-400'
                              : (health.flaggedPct ?? 0) > 5
                              ? 'text-orange-400'
                              : 'text-yellow-400'
                          }
                        >
                          {formatPct(health.flaggedPct)}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {health?.trend && health.trend !== 'flat' && (
                        <TrendIcon size={14} className={cn('inline', trendColor)} />
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/networks/${meta.slug}`}
                        className="inline-flex items-center gap-1 text-xs text-gray-600 group-hover:text-indigo-400 transition-colors font-medium"
                      >
                        Explore <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards grid below */}
      <h2 className="text-lg font-semibold text-white mb-4">Quick Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {networkHealth.map((nh) => {
          const meta = NETWORKS.find((n) => n.slug === nh.network)
          if (!meta) return null
          const color = getScoreColor(nh.meanScore)
          return (
            <Link
              key={nh.network}
              href={`/networks/${nh.network}`}
              className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 hover:border-indigo-500/30 transition-all group"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{meta.icon}</span>
                <span className="font-semibold text-sm text-white group-hover:text-indigo-300 transition-colors">
                  {meta.name}
                </span>
              </div>
              <div className="text-2xl font-bold font-mono mb-1" style={{ color }}>
                {nh.meanScore.toFixed(1)}
              </div>
              <div className="h-1 rounded-full bg-[#1e1e2e] mb-3">
                <div className="h-full rounded-full" style={{ width: `${nh.meanScore}%`, backgroundColor: color }} />
              </div>
              <div className="text-xs text-gray-500">
                {formatNumber(nh.totalNodes)} nodes · {formatPct(nh.flaggedPct)} flagged
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

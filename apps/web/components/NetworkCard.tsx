import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { NETWORKS } from '@/lib/constants'
import { formatNumber, formatPct, getScoreColor, getScoreBand } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface NetworkCardProps {
  slug: string
  totalNodes: number
  meanScore: number
  flaggedPct: number
  trend?: 'up' | 'down' | 'flat'
  className?: string
}

export function NetworkCard({
  slug,
  totalNodes,
  meanScore,
  flaggedPct,
  trend = 'flat',
  className,
}: NetworkCardProps) {
  const meta = NETWORKS.find((n) => n.slug === slug)
  const scoreColor = getScoreColor(meanScore)
  const band = getScoreBand(meanScore)

  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor =
    trend === 'up'
      ? 'text-green-400'
      : trend === 'down'
      ? 'text-red-400'
      : 'text-gray-500'

  if (!meta) return null

  return (
    <Link
      href={`/networks/${slug}`}
      className={cn(
        'block rounded-xl border border-[#1e1e2e] bg-[#111118] p-5',
        'transition-all duration-200 card-glow-hover group',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="text-2xl w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${meta.color}18`, border: `1px solid ${meta.color}30` }}
          >
            {meta.icon}
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm group-hover:text-indigo-300 transition-colors">
              {meta.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight max-w-[140px] line-clamp-1">
              {meta.description}
            </p>
          </div>
        </div>
        <div className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
          <TrendIcon size={13} />
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">Mean Integrity Score</span>
          <span
            className="text-sm font-bold font-mono"
            style={{ color: scoreColor }}
          >
            {meanScore.toFixed(1)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${meanScore}%`,
              backgroundColor: scoreColor,
              boxShadow: `0 0 8px ${scoreColor}`,
            }}
          />
        </div>
        <div className="mt-1 text-right">
          <span
            className="text-xs font-medium"
            style={{ color: scoreColor }}
          >
            {band.label}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[#0a0a0f] px-3 py-2">
          <p className="text-xs text-gray-500 mb-0.5">Total Nodes</p>
          <p className="text-sm font-semibold text-white font-mono">{formatNumber(totalNodes)}</p>
        </div>
        <div className="rounded-lg bg-[#0a0a0f] px-3 py-2">
          <p className="text-xs text-gray-500 mb-0.5">Flagged</p>
          <p
            className="text-sm font-semibold font-mono"
            style={{ color: flaggedPct > 10 ? '#ef4444' : flaggedPct > 5 ? '#f97316' : '#eab308' }}
          >
            {formatPct(flaggedPct)}
          </p>
        </div>
      </div>
    </Link>
  )
}

import { AlertTriangle, Clock, Cpu, TrendingDown } from 'lucide-react'
import { cn, timeAgo, confidenceToSeverity, SEVERITY_COLORS } from '@/lib/utils'
import { DETECTORS } from '@/lib/constants'

export interface FlagData {
  id: string
  detectorId: string
  nodeId: string
  network: string
  confidence: number
  evidenceSummary: string
  detectedAt: string | Date
  resolved?: boolean
}

interface FlagCardProps {
  flag: FlagData
  compact?: boolean
  className?: string
}

export function FlagCard({ flag, compact = false, className }: FlagCardProps) {
  const detector = DETECTORS.find((d) => d.id === flag.detectorId)
  const severity = confidenceToSeverity(flag.confidence)
  const severityColor = SEVERITY_COLORS[severity]

  const severityConfig = {
    low: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', label: 'Low' },
    medium: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'Medium' },
    high: { bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'High' },
    critical: { bg: 'bg-red-600/15', border: 'border-red-600/30', label: 'Critical' },
  }[severity]

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all duration-200',
        flag.resolved
          ? 'bg-[#0a0a0f] border-[#1e1e2e] opacity-60'
          : `${severityConfig.bg} ${severityConfig.border}`,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Icon */}
          <div
            className={cn(
              'mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center',
              severityConfig.bg,
              severityConfig.border,
              'border'
            )}
          >
            <AlertTriangle size={14} className={severityColor} />
          </div>

          <div className="min-w-0">
            {/* Detector name + severity */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-semibold text-sm text-white">
                {detector?.name ?? flag.detectorId}
              </span>
              <span
                className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full border',
                  severityConfig.bg,
                  severityConfig.border,
                  severityColor
                )}
              >
                {severityConfig.label}
              </span>
              {flag.resolved && (
                <span className="text-xs text-gray-600 px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">
                  Resolved
                </span>
              )}
            </div>

            {/* Evidence summary */}
            <p className="text-sm text-gray-400 leading-relaxed">
              {flag.evidenceSummary}
            </p>

            {!compact && (
              <div className="flex items-center gap-4 mt-2.5">
                {/* Confidence */}
                <div className="flex items-center gap-1.5">
                  <TrendingDown size={12} className="text-gray-600" />
                  <span className="text-xs text-gray-500">Confidence</span>
                  <span className={cn('text-xs font-semibold font-mono', severityColor)}>
                    {(flag.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Node */}
                <div className="flex items-center gap-1.5">
                  <Cpu size={12} className="text-gray-600" />
                  <span className="text-xs text-gray-500 font-mono">
                    {flag.nodeId.length > 12
                      ? `${flag.nodeId.slice(0, 12)}…`
                      : flag.nodeId}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
          <Clock size={11} />
          {timeAgo(flag.detectedAt)}
        </div>
      </div>

      {/* Confidence bar */}
      {!compact && (
        <div className="mt-3 h-1 rounded-full bg-[#1e1e2e] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${flag.confidence * 100}%`,
              backgroundColor:
                severity === 'critical'
                  ? '#ef4444'
                  : severity === 'high'
                  ? '#f87171'
                  : severity === 'medium'
                  ? '#f97316'
                  : '#eab308',
            }}
          />
        </div>
      )}
    </div>
  )
}

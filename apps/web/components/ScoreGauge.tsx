'use client'

import { getScoreBand, getScoreColor, clamp } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ScoreGaugeProps {
  score: number
  size?: number
  showLabel?: boolean
  className?: string
}

export function ScoreGauge({
  score,
  size = 160,
  showLabel = true,
  className,
}: ScoreGaugeProps) {
  const normalizedScore = clamp(score, 0, 100)
  const band = getScoreBand(normalizedScore)
  const color = getScoreColor(normalizedScore)

  // SVG arc geometry
  const cx = size / 2
  const cy = size / 2
  const radius = (size / 2) * 0.78
  const strokeWidth = size * 0.07

  // We draw a 240-degree arc (from 150° to 390°, i.e. starting bottom-left going clockwise)
  const startAngle = 150
  const totalAngle = 240
  const progressAngle = (normalizedScore / 100) * totalAngle
  const endAngle = startAngle + progressAngle

  function polarToCartesian(angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    }
  }

  function describeArc(startDeg: number, endDeg: number) {
    const start = polarToCartesian(startDeg)
    const end = polarToCartesian(endDeg)
    const arcSpan = endDeg - startDeg
    const largeArc = arcSpan > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  const trackPath = describeArc(startAngle, startAngle + totalAngle)
  const progressPath = progressAngle > 0 ? describeArc(startAngle, endAngle) : ''

  const fontSize = size * 0.22
  const labelFontSize = size * 0.09

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`Score: ${normalizedScore}`}>
        {/* Glow filter */}
        <defs>
          <filter id={`glow-${score}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`progress-grad-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.6" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Track (background arc) */}
        <path
          d={trackPath}
          fill="none"
          stroke="#1e1e2e"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Progress arc */}
        {progressPath && (
          <path
            d={progressPath}
            fill="none"
            stroke={`url(#progress-grad-${score})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            filter={`url(#glow-${score})`}
          />
        )}

        {/* Score number */}
        <text
          x={cx}
          y={cy + fontSize * 0.36}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight="700"
          fontFamily="ui-monospace, monospace"
          fill={color}
        >
          {normalizedScore}
        </text>

        {/* "/100" sub-label */}
        <text
          x={cx}
          y={cy + fontSize * 0.36 + labelFontSize * 1.4}
          textAnchor="middle"
          fontSize={labelFontSize}
          fill="#4b5563"
          fontFamily="ui-monospace, monospace"
        >
          / 100
        </text>
      </svg>

      {showLabel && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold border"
          style={{
            backgroundColor: `${color}1a`,
            color: color,
            borderColor: `${color}33`,
          }}
        >
          <span
            className="inline-block rounded-full"
            style={{ width: 7, height: 7, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
          />
          {band.label === 'High-Confidence Sybil' ? 'High-Confidence Sybil' : band.label}
        </span>
      )}
    </div>
  )
}

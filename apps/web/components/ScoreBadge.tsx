import { getScoreBand } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ScoreBadgeProps {
  score: number
  showScore?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ScoreBadge({
  score,
  showScore = true,
  size = 'md',
  className,
}: ScoreBadgeProps) {
  const band = getScoreBand(score)

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2',
  }

  // Short label for High-Confidence Sybil
  const shortLabel =
    band.label === 'High-Confidence Sybil' ? 'Sybil' : band.label

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold border',
        band.bgClass,
        band.textClass,
        band.borderClass,
        sizeClasses[size],
        className
      )}
    >
      {/* Status dot */}
      <span
        className="inline-block rounded-full shrink-0"
        style={{
          width: size === 'sm' ? 5 : 6,
          height: size === 'sm' ? 5 : 6,
          backgroundColor: band.color,
          boxShadow: `0 0 6px ${band.color}`,
        }}
      />
      {shortLabel}
      {showScore && (
        <span className="opacity-70 font-mono">{score}</span>
      )}
    </span>
  )
}

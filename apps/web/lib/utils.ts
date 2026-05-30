import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { SCORE_BANDS } from './constants'

/** Merges Tailwind classes without conflicts */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Returns the score band object for a given numeric score */
export function getScoreBand(score: number) {
  return (
    SCORE_BANDS.find((band) => score >= band.min && score <= band.max) ??
    SCORE_BANDS[SCORE_BANDS.length - 1]
  )
}

/** Returns the hex color for a given score */
export function getScoreColor(score: number): string {
  const band = getScoreBand(score)
  return band.color
}

/** Returns a Tailwind text color class for a given score */
export function getScoreTextClass(score: number): string {
  const band = getScoreBand(score)
  return band.textClass
}

/** Returns a Tailwind background class for a given score */
export function getScoreBgClass(score: number): string {
  const band = getScoreBand(score)
  return band.bgClass
}

/** Masks an Ethereum address to show first 6 and last 4 chars */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Formats a node ID for display (truncated) */
export function formatNodeId(nodeId: string, maxLen = 16): string {
  if (nodeId.length <= maxLen) return nodeId
  return `${nodeId.slice(0, maxLen)}…`
}

/** Returns a relative time string ("2h ago", "3d ago") */
export function timeAgo(date: Date | string | number): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return `${diffMo}mo ago`
  return `${Math.floor(diffMo / 12)}y ago`
}

/** Formats a number with K/M shorthand */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/** Formats a percentage with one decimal */
export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`
}

/** Clamps a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Generates a deterministic mock score for a node ID (for demo purposes) */
export function mockScore(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 101
}

/** Returns severity label from confidence value */
export function confidenceToSeverity(confidence: number): 'low' | 'medium' | 'high' | 'critical' {
  if (confidence >= 0.9) return 'critical'
  if (confidence >= 0.7) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}

/** Color classes for severity */
export const SEVERITY_COLORS: Record<string, string> = {
  low: 'text-yellow-400',
  medium: 'text-orange-400',
  high: 'text-red-400',
  critical: 'text-red-500',
}

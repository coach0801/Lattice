'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react'
import { ScoreBadge } from './ScoreBadge'
import { formatAddress, formatNodeId, timeAgo, formatNumber } from '@/lib/utils'
import { cn } from '@/lib/utils'

export interface NodeRow {
  nodeId: string
  network: string
  ownerWallet?: string
  score: number
  flagCount: number
  lastSeen: string | Date
  isOnline?: boolean
}

interface NodeTableProps {
  nodes: NodeRow[]
  network?: string
  showNetwork?: boolean
  className?: string
}

type SortKey = 'score' | 'flagCount' | 'lastSeen'
type SortDir = 'asc' | 'desc'

export function NodeTable({
  nodes,
  network,
  showNetwork = false,
  className,
}: NodeTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'score' ? 'asc' : 'desc')
    }
  }

  const sorted = [...nodes].sort((a, b) => {
    let diff = 0
    if (sortKey === 'score') diff = a.score - b.score
    else if (sortKey === 'flagCount') diff = a.flagCount - b.flagCount
    else if (sortKey === 'lastSeen') {
      diff = new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime()
    }
    return sortDir === 'asc' ? diff : -diff
  })

  function SortHeader({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col
    return (
      <button
        onClick={() => handleSort(col)}
        className={cn(
          'flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors',
          active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
        )}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        ) : (
          <ArrowUpDown size={12} className="opacity-40" />
        )}
      </button>
    )
  }

  return (
    <div className={cn('overflow-x-auto scrollbar-thin', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1e1e2e]">
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Node ID
            </th>
            {showNetwork && (
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Network
              </th>
            )}
            <th className="text-left py-3 px-4">
              <SortHeader label="Score" col="score" />
            </th>
            <th className="text-left py-3 px-4">
              <SortHeader label="Flags" col="flagCount" />
            </th>
            {nodes[0]?.ownerWallet !== undefined && (
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Owner
              </th>
            )}
            <th className="text-left py-3 px-4">
              <SortHeader label="Last Seen" col="lastSeen" />
            </th>
            <th className="py-3 px-4" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1e1e2e]">
          {sorted.map((node) => (
            <tr
              key={node.nodeId}
              className="hover:bg-[#111118] transition-colors group"
            >
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  {/* Online indicator */}
                  <span
                    className={cn(
                      'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                      node.isOnline !== false ? 'bg-green-500' : 'bg-gray-600'
                    )}
                    title={node.isOnline !== false ? 'Online' : 'Offline'}
                  />
                  <span className="font-mono text-xs text-gray-300">
                    {formatNodeId(node.nodeId)}
                  </span>
                </div>
              </td>

              {showNetwork && (
                <td className="py-3 px-4 text-xs text-gray-400 capitalize">
                  {node.network}
                </td>
              )}

              <td className="py-3 px-4">
                <ScoreBadge score={node.score} size="sm" />
              </td>

              <td className="py-3 px-4">
                <span
                  className={cn(
                    'font-mono text-xs font-semibold',
                    node.flagCount === 0
                      ? 'text-gray-500'
                      : node.flagCount < 3
                      ? 'text-yellow-400'
                      : 'text-red-400'
                  )}
                >
                  {node.flagCount === 0 ? '—' : formatNumber(node.flagCount)}
                </span>
              </td>

              {node.ownerWallet !== undefined && (
                <td className="py-3 px-4">
                  <span className="font-mono text-xs text-gray-400">
                    {formatAddress(node.ownerWallet)}
                  </span>
                </td>
              )}

              <td className="py-3 px-4 text-xs text-gray-500">
                {timeAgo(node.lastSeen)}
              </td>

              <td className="py-3 px-4">
                <Link
                  href={`/networks/${node.network}/nodes/${node.nodeId}`}
                  className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <ExternalLink size={12} />
                </Link>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={showNetwork ? 7 : 6}
                className="py-12 text-center text-gray-600 text-sm"
              >
                No nodes found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

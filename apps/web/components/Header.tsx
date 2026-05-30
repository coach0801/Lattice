'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Wallet, Menu, X, Activity } from 'lucide-react'
import { useState } from 'react'

const NAV_LINKS = [
  { href: '/networks', label: 'Networks' },
  { href: '/clusters', label: 'Clusters' },
  { href: '/dashboard', label: 'Dashboard' },
]

function LatticeLogo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Outer hexagon-ish shape */}
      <polygon
        points="14,2 24,8 24,20 14,26 4,20 4,8"
        stroke="#6366f1"
        strokeWidth="1.5"
        fill="none"
        opacity="0.5"
      />
      {/* Inner lattice cross */}
      <line x1="14" y1="2" x2="14" y2="26" stroke="#818cf8" strokeWidth="1" opacity="0.4" />
      <line x1="4" y1="8" x2="24" y2="20" stroke="#818cf8" strokeWidth="1" opacity="0.4" />
      <line x1="24" y1="8" x2="4" y2="20" stroke="#818cf8" strokeWidth="1" opacity="0.4" />
      {/* Nodes at intersections */}
      <circle cx="14" cy="2" r="1.8" fill="#6366f1" />
      <circle cx="24" cy="8" r="1.8" fill="#6366f1" />
      <circle cx="24" cy="20" r="1.8" fill="#6366f1" />
      <circle cx="14" cy="26" r="1.8" fill="#6366f1" />
      <circle cx="4" cy="20" r="1.8" fill="#6366f1" />
      <circle cx="4" cy="8" r="1.8" fill="#6366f1" />
      {/* Center node */}
      <circle cx="14" cy="14" r="2.5" fill="#818cf8" />
      <circle cx="14" cy="14" r="4" fill="none" stroke="#6366f1" strokeWidth="0.8" opacity="0.4" />
    </svg>
  )
}

export function Header() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-[#1e1e2e] bg-[#0a0a0f]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 group"
          >
            <div className="transition-transform group-hover:scale-110 duration-200">
              <LatticeLogo />
            </div>
            <span className="font-bold text-white tracking-tight">
              Lattice
              <span className="text-indigo-400"> Protocol</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active =
                link.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150',
                    active
                      ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500">
              <Activity size={11} className="text-green-500 animate-pulse" />
              <span>Live</span>
            </div>

            {/* Connect Wallet button */}
            <button
              className={cn(
                'hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium',
                'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300',
                'hover:bg-indigo-600/30 hover:border-indigo-500/50 hover:text-indigo-200',
                'transition-all duration-150'
              )}
            >
              <Wallet size={14} />
              Connect Wallet
            </button>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-1.5 text-gray-400 hover:text-white transition-colors"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#1e1e2e] px-4 py-3 space-y-1">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'block px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                {link.label}
              </Link>
            )
          })}
          <div className="pt-2 pb-1">
            <button className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium bg-indigo-600/20 border border-indigo-500/30 text-indigo-300">
              <Wallet size={14} />
              Connect Wallet
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

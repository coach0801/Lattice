import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'
import { cn } from '@/lib/utils'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Lattice Protocol | DePIN Integrity Infrastructure',
  description:
    'Real-time Sybil detection and integrity scoring across DePIN networks — cryptographically attested on-chain. Monitor Hivemapper, GEODNET, WeatherXM, DIMO, and Nubila.',
  keywords: [
    'DePIN',
    'Sybil detection',
    'blockchain',
    'integrity',
    'Hivemapper',
    'GEODNET',
    'WeatherXM',
    'DIMO',
    'Nubila',
  ],
  openGraph: {
    title: 'Lattice Protocol | DePIN Integrity Infrastructure',
    description:
      'Real-time Sybil detection and integrity scoring across DePIN networks.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={cn(
          inter.variable,
          'font-sans min-h-screen bg-[#0a0a0f] text-gray-100 antialiased'
        )}
      >
        <Header />

        <main className="flex-1">
          {children}
        </main>

        <footer className="border-t border-[#1e1e2e] mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg width="16" height="16" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                  <polygon points="14,2 24,8 24,20 14,26 4,20 4,8" stroke="#4f46e5" strokeWidth="1.5" fill="none" opacity="0.6" />
                  <circle cx="14" cy="14" r="2.5" fill="#6366f1" />
                </svg>
                <span>
                  Powered by{' '}
                  <span className="text-indigo-400 font-medium">Lattice Protocol</span>
                  {' '}·{' '}
                  <span className="text-yellow-500/70">Testnet v0.1</span>
                </span>
              </div>
              <div className="flex items-center gap-6 text-xs text-gray-700">
                <a href="#" className="hover:text-gray-400 transition-colors">Docs</a>
                <a href="#" className="hover:text-gray-400 transition-colors">GitHub</a>
                <a href="#" className="hover:text-gray-400 transition-colors">API</a>
                <a href="#" className="hover:text-gray-400 transition-colors">Discord</a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}

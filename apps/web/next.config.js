/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['api.weatherxm.com', 'hivemapper.com'],
  },
  experimental: {
    serverComponentsExternalPackages: ['@neondatabase/serverless'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    DATABASE_URL: process.env.DATABASE_URL ?? '',
  },
}
module.exports = nextConfig

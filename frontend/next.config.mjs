/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL ?? 'http://localhost:3001'

const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backend}/:path*` }]
  },
}

export default nextConfig

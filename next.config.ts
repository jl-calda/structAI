import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * `/` is a pure HTTP redirect to `/dashboard`. Done at the edge via
   * `redirects()` instead of an `app/page.tsx` `redirect()` call, because
   * the prerendered-redirect form emits a static HTML artifact that
   * Vercel's router mishandles when Vercel Toolbar appends its probe
   * query string (resulting in a Middleware 404).
   */
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: false,
      },
    ]
  },
}

export default nextConfig

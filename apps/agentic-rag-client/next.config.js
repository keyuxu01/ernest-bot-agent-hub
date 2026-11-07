import process from 'node:process';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9020';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;

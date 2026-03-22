/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'duckdb'],
  },
  env: {
    NEXT_PUBLIC_BUILD_VERSION: process.env.NEXT_PUBLIC_BUILD_VERSION || process.env.BUILD_VERSION || 'dev',
  },
};

export default nextConfig;

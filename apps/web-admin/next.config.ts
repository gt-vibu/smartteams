import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@smarteam/config', '@smarteam/contracts', '@smarteam/ui'],
};

export default nextConfig;

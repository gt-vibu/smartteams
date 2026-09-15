import type { NextConfig } from 'next';

/**
 * Serving the workspace through a tunnel (ngrok, Cloudflare Tunnel) to test it on a real phone.
 *
 * Two things stop that working out of the box, and both are opt-in here so nothing changes for a
 * deployment that sets neither variable:
 *
 * - `DEV_TUNNEL_HOSTS` — the dev server refuses its own dev-only resources (the HMR socket, dev
 *   chunks) to any origin but localhost, so over a tunnel the page never finishes booting. List
 *   the exact tunnel host rather than a `*.ngrok-free.dev` wildcard: that protection exists so
 *   another site cannot read this dev server, and any stranger can own a subdomain of a tunnel
 *   provider's domain.
 *
 * - `API_PROXY_TARGET` — the browser calls the API directly at `NEXT_PUBLIC_API_URL`, which in
 *   development is `http://localhost:4000`. On a phone, localhost is the phone, and an https page
 *   may not call http anyway. With this set, `/v1/*` is forwarded to the API by this server, so a
 *   browser that sets `NEXT_PUBLIC_API_URL` to empty makes same-origin requests through the one
 *   tunnel: no CORS, no mixed content, and the session cookies are first-party.
 *
 * See `.env.local.example` for the three lines that enable it.
 */
const devTunnelHosts = (process.env.DEV_TUNNEL_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);
const apiProxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/$/, '');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@smarteam/config', '@smarteam/contracts', '@smarteam/ui'],
  allowedDevOrigins: devTunnelHosts,
  rewrites: () =>
    Promise.resolve(
      apiProxyTarget ? [{ source: '/v1/:path*', destination: `${apiProxyTarget}/v1/:path*` }] : [],
    ),
};

export default nextConfig;

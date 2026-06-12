import type { NextConfig } from 'next';

const imageRemoteHosts = (process.env.NEXT_IMAGE_REMOTE_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add 'import path from "path"' if needed
  /* config options here */
  experimental: {
    proxyClientMaxBodySize: '100mb',
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';
    const securityHeaders = [
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob: https:",
          "connect-src 'self' https:",
          "font-src 'self' data:",
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
    ];
    if (isProduction) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=15552000; includeSubDomains',
      });
    }
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  images: {
    remotePatterns: imageRemoteHosts.map((hostname) => ({
      protocol: 'https',
      hostname,
      pathname: '/**',
    })),
  },
};

export default nextConfig;

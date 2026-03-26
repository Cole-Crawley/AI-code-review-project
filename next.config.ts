import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: ['framer-motion'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
      // REMOVED the Cache-Control header for _next/static because it breaks development
      // If you want to keep it for production only, you can conditionally add it:
      // process.env.NODE_ENV === 'production' && {
      //   source: '/_next/static/(.*)',
      //   headers: [
      //     { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      //   ],
      // },
    ];
  },
  // Webpack configuration for Monaco Editor
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Fix for Monaco Editor in client-side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        'node:fs': false,
        'node:path': false,
        'node:os': false,
      };
    }
    return config;
  },
  // Turbopack configuration for Monaco Editor
  turbopack: {
    resolveAlias: {
      // Ensure Monaco Editor works with Turbopack
      'monaco-editor': 'monaco-editor/esm/vs/editor/editor.api',
    },
  },
};

export default nextConfig;
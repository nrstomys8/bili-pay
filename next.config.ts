import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 정적 자산(서비스 워커 등)을 위해 헤더 설정
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
};

export default nextConfig;

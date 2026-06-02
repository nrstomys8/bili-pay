import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '브리시엘 결제요청',
    short_name: '결제요청',
    description: '회사 비품 결제 요청 및 관리',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0c0d12',
    theme_color: '#0c0d12',
    lang: 'ko',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

'use client'

import { useEffect } from 'react'

// 서비스 워커를 등록해 PWA로 동작하도록 함
export default function SwRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // dev 환경에서도 등록 (HTTPS 필수 — vercel/localhost는 OK)
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 등록 실패는 조용히 무시 (개발 환경 등)
      })
    }
    if (document.readyState === 'complete') {
      onLoad()
    } else {
      window.addEventListener('load', onLoad)
      return () => window.removeEventListener('load', onLoad)
    }
  }, [])
  return null
}

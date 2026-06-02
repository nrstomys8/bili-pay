// 브리시엘 결제요청 — Service Worker
// PWA 설치 + 푸시 알림 처리용 최소 워커

const CACHE = 'bili-pay-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// 푸시 메시지 수신 시 알림 표시
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: '결제요청', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || '💸 새 결제 요청'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    vibrate: [80, 40, 80],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 알림 클릭 시 앱 열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})

// 네트워크 우선 — 캐시는 사용하지 않음 (DB 데이터가 항상 최신이어야 함)
self.addEventListener('fetch', () => {})

import { supabase } from './supabase'

// VAPID 공개 키 (base64url) → ArrayBuffer (PushManager.subscribe 호환)
function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return buf
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// 푸시 구독을 만들고 Supabase에 저장
export async function subscribeToPush(label?: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: '이 브라우저는 푸시를 지원하지 않습니다' }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) return { ok: false, error: 'VAPID 키가 설정되지 않았습니다' }

  // 권한
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, error: '알림 권한이 거부되었습니다' }

  // 서비스 워커 ready
  const reg = await navigator.serviceWorker.ready

  // 기존 구독이 있으면 그대로 사용, 없으면 새로 만들기
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(vapidPublicKey),
    })
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    return { ok: false, error: '구독 정보가 올바르지 않습니다' }
  }

  // Supabase에 upsert (같은 endpoint 가 있으면 라벨만 업데이트)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        label: label ?? null,
      },
      { onConflict: 'endpoint' }
    )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

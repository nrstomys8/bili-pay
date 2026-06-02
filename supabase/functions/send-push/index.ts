// Supabase Edge Function — 새 결제 요청 등록 시 모든 푸시 구독자에게 알림 발송
//
// 호출 트리거: Database Webhook (payment_requests 테이블 INSERT)
// 또는 직접 POST {title, body, url} 호출 가능
//
// 필요한 환경변수(Secrets):
//   VAPID_PUBLIC_KEY  — 공개 키
//   VAPID_PRIVATE_KEY — 비공개 키
//   VAPID_SUBJECT     — "mailto:your@email.com" 형식
//   SUPABASE_URL      — (자동 주입됨)
//   SUPABASE_SERVICE_ROLE_KEY — (자동 주입됨)

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

type WebhookPayload = {
  type?: 'INSERT' | 'UPDATE' | 'DELETE'
  table?: string
  record?: {
    title: string
    amount: number
    method: string
    requester?: string | null
  }
}

type DirectPayload = {
  title?: string
  body?: string
  url?: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const payload = (await req.json().catch(() => ({}))) as WebhookPayload & DirectPayload

  // 알림 내용 결정
  let title = '💸 새 결제 요청'
  let body = ''
  const url = payload.url ?? '/'

  if (payload.record) {
    // DB webhook으로 호출된 경우
    const r = payload.record
    body = `${r.title} · ${r.amount.toLocaleString('ko-KR')}원 · ${r.method}${
      r.requester ? ` · ${r.requester}` : ''
    }`
  } else {
    // 직접 호출된 경우
    if (payload.title) title = payload.title
    body = payload.body ?? ''
  }

  // 모든 구독자 조회
  const { data: subs, error: fetchError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')

  if (fetchError) {
    return new Response(JSON.stringify({ ok: false, error: fetchError.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  const results = await Promise.allSettled(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify({ title, body, url })
        )
        return { id: s.id, ok: true }
      } catch (e: unknown) {
        const err = e as { statusCode?: number; body?: string; message?: string }
        // 410 = 구독 만료. DB에서 정리
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
        }
        return { id: s.id, ok: false, error: err.message ?? String(e) }
      }
    })
  )

  const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
  const fail = results.length - ok

  return new Response(JSON.stringify({ ok: true, sent: ok, failed: fail, total: results.length }), {
    headers: { 'content-type': 'application/json' },
  })
})

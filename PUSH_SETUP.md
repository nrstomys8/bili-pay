# 푸시 알림 설정 가이드

앱이 꺼져 있을 때도 알림이 오는 진짜 푸시 알림을 활성화하는 방법.

## 사전에 알아두기

- iOS는 **iOS 16.4 이상** + **홈 화면에 설치된 PWA** 에서만 푸시 작동
- 안드로이드는 Chrome/Samsung Internet 모두 OK
- 그냥 브라우저 탭에 떠있는 상태에서도 작동 (단, 탭이 백그라운드여도 옴)

---

## 단계 1 — Vercel에 VAPID 공개키 추가

1. https://vercel.com/nrstomys8s-projects/bili-pay/settings/environment-variables
2. **Add New** 클릭
3. Key: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
4. Value:
   ```
   BPQ7gKSzj68WeQKQvqavJww5PaYNaC_nOMwuN---gW1i53_n5yQ0fDN16-qUXq_4od5jBlq5zDHDyumsF3dUQ9A
   ```
5. **Save**
6. 상단 Deployments 탭 → 최신 배포의 ⋯ → **Redeploy** (환경변수 반영)

---

## 단계 2 — Supabase에 Edge Function 만들기

### 2-1. Edge Function 생성

1. https://supabase.com/dashboard/project/ruincbkmkbptsewfxnss/functions
2. **Deploy a new function** 또는 **Create a new function** 클릭
3. Function name: `send-push`
4. 코드 입력란에 `supabase/functions/send-push/index.ts` 파일 내용 **통째로 복사** → 붙여넣기
5. **Deploy function** 클릭

### 2-2. Secrets (환경변수) 입력

1. 같은 페이지에서 **Manage secrets** 또는 좌측 메뉴 **Edge Functions → Secrets** 진입
2. **New secret** 으로 3개 추가:

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | `BPQ7gKSzj68WeQKQvqavJww5PaYNaC_nOMwuN---gW1i53_n5yQ0fDN16-qUXq_4od5jBlq5zDHDyumsF3dUQ9A` |
| `VAPID_PRIVATE_KEY` | `lC7XdED_SalHDon80oOZDDtmXxbe6fGc75x6tG-ai9o` |
| `VAPID_SUBJECT` | `mailto:nrstomys8@gmail.com` |

> ⚠️ `VAPID_PRIVATE_KEY`는 노출하면 안 됩니다. Edge Function 시크릿에만 저장.

---

## 단계 3 — Database Webhook 설정

새 요청이 들어오면 자동으로 Edge Function을 호출하도록 연결.

1. https://supabase.com/dashboard/project/ruincbkmkbptsewfxnss/database/hooks
2. **Create a new hook** 클릭
3. 다음과 같이 입력:

| 항목 | 값 |
|---|---|
| Name | `notify-new-payment` |
| Table | `payment_requests` |
| Events | ☑ Insert (다른 건 체크 해제) |
| Type | `Supabase Edge Functions` |
| Edge Function | `send-push` |
| HTTP Method | `POST` |
| HTTP Headers | (기본값 유지) |

4. **Create webhook** 클릭

---

## 단계 4 — 푸시 구독 테이블 RLS 확인

이미 첫 SQL에 포함돼 있지만 확인:

```sql
-- 이미 있으면 다시 실행해도 OK
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  label text,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists "anon all on push_subscriptions" on push_subscriptions;
create policy "anon all on push_subscriptions"
  on push_subscriptions for all
  to anon, authenticated
  using (true) with check (true);
```

---

## 단계 5 — 테스트

1. Vercel 재배포가 완료되길 기다림 (2분)
2. 휴대폰에서 https://bili-pay.vercel.app/ 접속 (Chrome 또는 PWA로 설치된 앱)
3. 우측 상단 **🔔 알림 켜기** 탭 → 권한 허용 → 기기 이름 입력 (예: "주석폰")
4. **다른 기기 또는 다른 브라우저**에서 새 결제 요청 등록
5. 휴대폰에 푸시 알림이 떠야 함 (앱이 꺼져있어도)

---

## 트러블슈팅

- **"VAPID 키가 설정되지 않았습니다"** → Vercel 환경변수 추가 후 Redeploy 안 한 상태
- **알림이 안 옴** → Supabase Edge Function 로그 확인: Dashboard → Edge Functions → send-push → Logs
- **iOS에서 안 됨** → iOS 16.4 미만이거나, 브라우저에서 직접 열고 있음. **반드시 홈 화면에 추가된 PWA**에서만 작동

## VAPID 키 재생성 (필요 시)

기존 구독 모두 무효화되니 주의:

```powershell
cd C:\Users\kyjky\Desktop\클로드\bili-pay
npx web-push generate-vapid-keys
```

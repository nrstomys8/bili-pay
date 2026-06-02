# 브리시엘 결제요청 (bili-pay)

회사 비품 결제 요청을 모바일에서 한 번에 올리고, 결제 링크를 눌러 구매하면 자동으로 "결제중 → 완료" 흐름으로 정리되는 PWA.

- **결제 요청 등록**: 제목, 금액, 결제수단(쿠팡/네이버/계좌이체/기타), 결제 링크 or 계좌번호
- **원터치 결제**: "결제 링크 열기" 누르면 새 탭으로 열리고, 돌아오면 "구매하셨나요?" 팝업
- **카톡 공유**: 등록 직후 또는 카드의 💬 버튼으로 카톡에 공유
- **푸시 알림**: 새 요청이 올라오면 브라우저 알림 (다른 기기에서 등록한 것도 실시간 반영 — Supabase Realtime)
- **월별 정리 + 합계**: 월 선택 → 결제수단별 합계 자동 계산
- **엑셀 내보내기**: 현재 보고 있는 월을 `.xlsx` 다운로드

기술 스택: Next.js 16 · Supabase · Tailwind CSS v4 · TypeScript · PWA

---

## 1) 처음 한 번 — 셋업

### 1-1. 의존성 설치

PowerShell에서:

```powershell
cd "C:\Users\kyjky\Desktop\클로드\bili-pay"
npm install
```

### 1-2. Supabase 프로젝트 준비

기존 my-schedule용 Supabase를 그대로 써도 되고, 새로 만들어도 됩니다.

- 기존 프로젝트를 쓸 경우: `.env.local`에 my-schedule과 동일한 URL/KEY 입력
- 새로 만들 경우: https://supabase.com 에서 새 프로젝트 생성 → Project Settings → API 에서 URL과 anon key 복사

### 1-3. DB 스키마 생성

Supabase 대시보드 → SQL Editor → New query 에 `supabase/schema.sql` 내용 그대로 붙여넣고 RUN.

테이블 2개가 생성됩니다:
- `payment_requests` — 결제 요청 본체
- `push_subscriptions` — (선택) 웹 푸시 구독 — v1에서는 사용 안 함

### 1-4. 실시간 활성화

Supabase 대시보드 → Database → Replication → `supabase_realtime` publication 에서 `payment_requests` 테이블 토글 ON.
(다른 기기에서 올라온 요청을 실시간으로 받아오는 데 필요)

### 1-5. 환경변수 설정

`.env.local.example` 을 복사해서 `.env.local` 로 이름 변경 후 값 채우기:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

---

## 2) 개발 서버 실행

```powershell
npm run dev
```

브라우저에서 http://localhost:3000 접속.

---

## 3) Vercel 배포

1. GitHub 저장소 생성 후 푸시
2. https://vercel.com → New Project → 저장소 선택
3. Environment Variables 에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 등록
4. Deploy

배포 후 휴대폰 Safari/Chrome 에서 사이트 접속 → **홈 화면에 추가** 하면 PWA처럼 동작합니다.

---

## 4) 사용 흐름

1. **새 요청 등록**
   - "+ 새 결제 요청" 버튼 → 폼 작성 → 등록
   - 등록 직후 카톡 공유 시트가 자동으로 뜸 (모바일)

2. **결제하기**
   - 카드의 "🔗 결제 링크 열기" 누르면 → 자동으로 "결제중" 상태로 바뀌고 → 새 탭으로 결제 페이지 열림
   - 결제 끝내고 앱으로 돌아오면 "구매하셨나요?" 팝업이 뜸 → "완료 처리" 누르면 끝

3. **계좌이체**
   - 결제수단을 "계좌이체"로 두면 링크 칸에 계좌번호 입력
   - "💳 계좌번호 복사 + 결제중으로" 누르면 클립보드 복사 + 결제중 처리

4. **월별 정리**
   - 상단의 월 선택으로 조회
   - 하단에 결제수단별 합계 자동 계산
   - "📥 엑셀" 누르면 `.xlsx` 다운로드

5. **알림**
   - 상단 "🔔 알림 켜기" 한 번 눌러 권한 허용
   - 앱이 열린 상태에서 다른 기기가 새 요청을 올리면 브라우저 알림이 뜸
   - 백그라운드 푸시(앱 꺼져 있을 때 알림)는 v2에서 추가 예정 — 지금은 PWA 홈 화면 추가 시 배지로만 확인

---

## 5) 자동 완료 처리의 한계 (중요)

쿠팡/네이버는 외부 앱에 "결제 완료" 신호를 보내주지 않습니다. 따라서 100% 자동은 불가능합니다. 대신 이 앱은:

- 결제 링크를 누른 순간 → "결제중" 상태로 변경
- 외부 사이트 다녀와서 앱으로 돌아오면 (3초 이상 자리 비웠을 때) → "구매하셨나요?" 팝업
- 사용자가 한 번 탭하면 → "완료"

즉 **원터치(=링크 열기) + 한 번의 확인 탭**으로 처리됩니다. 실수로 "완료" 처리됐다면 카드의 "↺ 대기로 되돌리기"로 복구할 수 있습니다.

---

## 6) 폴더 구조

```
bili-pay/
├── app/
│   ├── globals.css         — Tailwind v4 + 다크 테마
│   ├── layout.tsx          — 루트 레이아웃 + PWA 메타
│   ├── manifest.ts         — PWA manifest
│   ├── page.tsx            — 메인 화면 (모든 UI/로직)
│   └── sw-register.tsx     — 서비스 워커 등록 클라이언트 컴포넌트
├── lib/
│   └── supabase.ts         — Supabase 클라이언트 싱글턴
├── public/
│   ├── sw.js               — 서비스 워커 (PWA + 푸시 수신)
│   └── icon-192.svg, icon-512.svg
├── supabase/
│   └── schema.sql          — DB 스키마
├── .env.local.example
└── package.json
```

단일 페이지 앱 구조 — my-schedule과 동일한 패턴입니다.

-- 브리시엘 결제요청 DB 스키마
-- Supabase SQL Editor 에서 그대로 실행하세요.

create extension if not exists "pgcrypto";

-- 결제 요청 테이블
create table if not exists payment_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,                                  -- 제목 / 무엇을 사는지
  amount integer not null default 0,                    -- 금액 (원)
  method text not null,                                 -- 결제수단: 쿠팡 / 네이버 / 계좌이체 / 기타
  link text,                                            -- 결제 링크 (URL) 또는 계좌번호
  memo text,                                            -- 메모
  requester text,                                       -- 요청자 이름
  status text not null default '대기',                  -- 대기 / 결제중 / 완료
  link_opened_at timestamptz,                           -- 마지막으로 결제 링크를 연 시각
  completed_at timestamptz,                             -- 완료된 시각
  created_at timestamptz not null default now()
);

create index if not exists payment_requests_created_at_idx
  on payment_requests (created_at desc);
create index if not exists payment_requests_status_idx
  on payment_requests (status);

-- 웹 푸시 구독 정보
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  label text,                                           -- 구독자 별명 (예: "주석폰")
  created_at timestamptz not null default now()
);

-- 익명 접근 허용 (인증 없이 사용)
alter table payment_requests enable row level security;
alter table push_subscriptions enable row level security;

drop policy if exists "anon all on payment_requests" on payment_requests;
create policy "anon all on payment_requests"
  on payment_requests for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "anon all on push_subscriptions" on push_subscriptions;
create policy "anon all on push_subscriptions"
  on push_subscriptions for all
  to anon, authenticated
  using (true) with check (true);

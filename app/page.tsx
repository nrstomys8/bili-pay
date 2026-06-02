'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { subscribeToPush, getCurrentSubscription, isPushSupported } from '../lib/push'

type Status = '대기' | '결제중' | '완료'
type Method = '쿠팡' | '네이버' | '계좌이체' | '기타'

type PaymentRequest = {
  id: string
  title: string
  amount: number
  method: Method
  link: string | null
  memo: string | null
  requester: string | null
  status: Status
  link_opened_at: string | null
  completed_at: string | null
  created_at: string
}

const METHODS: Method[] = ['쿠팡', '네이버', '계좌이체', '기타']

const METHOD_STYLE: Record<Method, string> = {
  쿠팡: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  네이버: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  계좌이체: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
  기타: 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30',
}

const STATUS_DOT: Record<Status, string> = {
  대기: 'bg-rose-400',
  결제중: 'bg-amber-400 animate-pulse',
  완료: 'bg-emerald-400',
}

const STATUS_BADGE: Record<Status, string> = {
  대기: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
  결제중: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  완료: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
}

const todayISO = () => new Date().toISOString().split('T')[0]
const toMonthKey = (iso: string) => iso.slice(0, 7) // "2026-06"

const formatWon = (n: number) => n.toLocaleString('ko-KR') + '원'
const formatDate = (iso: string) => {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}.${dd} ${hh}:${mi}`
}

export default function Home() {
  const [items, setItems] = useState<PaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 현재 보고 있는 월 (YYYY-MM)
  const [monthKey, setMonthKey] = useState<string>(toMonthKey(todayISO()))

  // 입력 폼
  const [form, setForm] = useState({
    title: '',
    amount: '',
    method: '쿠팡' as Method,
    link: '',
    memo: '',
    requester: '',
  })

  // 편집
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    title: '', amount: '', method: '쿠팡' as Method,
    link: '', memo: '', requester: '',
  })

  // 알림 토스트용 ref만 유지 (결제중 추적은 더 이상 사용 안 함 — 즉시 완료 처리로 변경됨)

  // 토스트
  const [toast, setToast] = useState<string | null>(null)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }, [])

  // 알림/구독 상태
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [pushSubscribed, setPushSubscribed] = useState(false)

  useEffect(() => {
    fetchAll()
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPerm(Notification.permission)
    }
    if (isPushSupported()) {
      getCurrentSubscription().then((s) => setPushSubscribed(!!s))
    }
  }, [])

  // 실시간 구독 — 새 요청이 다른 기기에서 올라오면 바로 반영 + 알림
  useEffect(() => {
    const channel = supabase
      .channel('payment_requests-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_requests' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as PaymentRequest
            setItems((prev) => [row, ...prev.filter((p) => p.id !== row.id)])
            // 로컬 알림
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('💸 새 결제 요청', {
                  body: `${row.title} · ${formatWon(row.amount)} · ${row.method}`,
                  tag: row.id,
                })
              } catch {}
            }
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as PaymentRequest
            setItems((prev) => prev.map((p) => (p.id === row.id ? row : p)))
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id: string }
            setItems((prev) => prev.filter((p) => p.id !== oldRow.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchAll() {
    setLoading(true)
    const { data, error } = await supabase
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setItems(data as PaymentRequest[])
    setLoading(false)
  }

  async function addRequest() {
    if (!form.title.trim()) {
      showToast('제목을 입력해주세요')
      return
    }
    const amountNum = Number(form.amount.replace(/[^0-9]/g, '')) || 0
    setSubmitting(true)
    const { data, error } = await supabase
      .from('payment_requests')
      .insert({
        title: form.title.trim(),
        amount: amountNum,
        method: form.method,
        link: form.link.trim() || null,
        memo: form.memo.trim() || null,
        requester: form.requester.trim() || null,
        status: '대기',
      })
      .select()
      .single()
    setSubmitting(false)
    if (error) {
      showToast('저장 실패: ' + error.message)
      return
    }
    // 폼 초기화
    setForm({ title: '', amount: '', method: '쿠팡', link: '', memo: '', requester: '' })
    setShowForm(false)
    showToast('요청이 등록되었습니다')

    // 등록 직후 카톡 공유 옵션 제공
    if (data) shareToKakao(data as PaymentRequest)
  }

  function shareToKakao(req: PaymentRequest) {
    const text = `💸 새 결제 요청\n${req.title}\n${formatWon(req.amount)} · ${req.method}${req.link ? `\n${req.link}` : ''}${req.requester ? `\n요청자: ${req.requester}` : ''}`
    if (typeof navigator === 'undefined') return
    const nav = navigator as Navigator
    if (typeof nav.share === 'function') {
      nav.share({ title: '결제 요청', text }).catch(() => {})
    } else if (nav.clipboard) {
      nav.clipboard.writeText(text).then(() => showToast('클립보드에 복사됨 — 카톡에 붙여넣기'))
    }
  }

  async function deleteRequest(id: string) {
    if (!confirm('정말 삭제할까요?')) return
    const { error } = await supabase.from('payment_requests').delete().eq('id', id)
    if (error) {
      showToast('삭제 실패: ' + error.message)
      return
    }
    showToast('삭제되었습니다')
  }

  function startEdit(req: PaymentRequest) {
    setEditingId(req.id)
    setEditForm({
      title: req.title,
      amount: String(req.amount),
      method: req.method,
      link: req.link ?? '',
      memo: req.memo ?? '',
      requester: req.requester ?? '',
    })
  }

  async function saveEdit() {
    if (!editingId) return
    const amountNum = Number(editForm.amount.replace(/[^0-9]/g, '')) || 0
    const { error } = await supabase
      .from('payment_requests')
      .update({
        title: editForm.title.trim(),
        amount: amountNum,
        method: editForm.method,
        link: editForm.link.trim() || null,
        memo: editForm.memo.trim() || null,
        requester: editForm.requester.trim() || null,
      })
      .eq('id', editingId)
    if (error) {
      showToast('수정 실패: ' + error.message)
      return
    }
    setEditingId(null)
    showToast('수정되었습니다')
  }

  async function openLink(req: PaymentRequest) {
    if (!req.link) {
      showToast('결제 링크/계좌가 없습니다')
      return
    }
    const now = new Date().toISOString()
    // 계좌이체 → 계좌번호 복사 + 즉시 완료 처리
    if (req.method === '계좌이체') {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(req.link).catch(() => {})
      }
      await supabase
        .from('payment_requests')
        .update({ status: '완료', link_opened_at: now, completed_at: now })
        .eq('id', req.id)
      showToast('계좌번호 복사 + 완료 처리됨')
      return
    }
    // 결제 링크 → 새 탭으로 열기 + 즉시 완료 처리
    const url = req.link.startsWith('http') ? req.link : `https://${req.link}`
    await supabase
      .from('payment_requests')
      .update({ status: '완료', link_opened_at: now, completed_at: now })
      .eq('id', req.id)
    window.open(url, '_blank', 'noopener,noreferrer')
    showToast('완료 처리됨 — 실수면 ↺ 되돌리기')
  }

  async function markCompleted(id: string) {
    const { error } = await supabase
      .from('payment_requests')
      .update({ status: '완료', completed_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      showToast('처리 실패: ' + error.message)
      return
    }
    showToast('구매 완료로 처리되었습니다')
  }

  async function revertToWaiting(id: string) {
    await supabase
      .from('payment_requests')
      .update({ status: '대기', completed_at: null })
      .eq('id', id)
    showToast('대기 상태로 되돌렸습니다')
  }

  async function enablePushNotifications() {
    if (!isPushSupported()) {
      showToast('이 브라우저는 푸시 알림을 지원하지 않습니다')
      return
    }
    // 라벨로 기기 식별 (예: "주석폰", "센터장PC" 등) — 비워두면 자동
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isMobile = /iPhone|Android|Mobile/i.test(ua)
    const defaultLabel = isMobile ? '모바일' : 'PC'
    const label = prompt('이 기기 이름을 입력하세요 (예: 주석폰, 사무실PC)', defaultLabel)
    if (label === null) return // 취소
    const result = await subscribeToPush(label || defaultLabel)
    setNotifPerm(Notification.permission)
    setPushSubscribed(result.ok)
    if (result.ok) showToast('알림이 켜졌습니다 (앱이 꺼져있어도 옴)')
    else showToast('실패: ' + (result.error ?? '알 수 없는 오류'))
  }

  // 월별 필터
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    set.add(toMonthKey(todayISO()))
    items.forEach((i) => set.add(toMonthKey(i.created_at)))
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1))
  }, [items])

  const filtered = useMemo(
    () => items.filter((i) => toMonthKey(i.created_at) === monthKey),
    [items, monthKey]
  )

  // 그룹 분리
  const grouped = useMemo(() => {
    return {
      대기: filtered.filter((i) => i.status === '대기'),
      결제중: filtered.filter((i) => i.status === '결제중'),
      완료: filtered.filter((i) => i.status === '완료'),
    }
  }, [filtered])

  // 합계 계산
  const totals = useMemo(() => {
    const sumByStatus = (s: Status) =>
      filtered.filter((i) => i.status === s).reduce((a, b) => a + b.amount, 0)
    const sumByMethod = (m: Method) =>
      filtered.filter((i) => i.status === '완료' && i.method === m).reduce((a, b) => a + b.amount, 0)
    return {
      대기금액: sumByStatus('대기'),
      완료금액: sumByStatus('완료'),
      전체: filtered.reduce((a, b) => a + b.amount, 0),
      methodSums: {
        쿠팡: sumByMethod('쿠팡'),
        네이버: sumByMethod('네이버'),
        계좌이체: sumByMethod('계좌이체'),
        기타: sumByMethod('기타'),
      } as Record<Method, number>,
    }
  }, [filtered])

  async function exportExcel() {
    // 동적 import — 클라이언트에서만 로드
    const XLSX = await import('xlsx')
    const rows = filtered.map((i) => ({
      등록일: formatDate(i.created_at),
      제목: i.title,
      금액: i.amount,
      결제수단: i.method,
      상태: i.status,
      요청자: i.requester ?? '',
      링크: i.link ?? '',
      메모: i.memo ?? '',
      완료일: i.completed_at ? formatDate(i.completed_at) : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
      { wch: 10 }, { wch: 32 }, { wch: 24 }, { wch: 14 },
    ]
    // 합계 행 추가
    XLSX.utils.sheet_add_aoa(
      ws,
      [[], ['합계', '', totals.전체, '', '', '', '', '', '']],
      { origin: -1 }
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${monthKey}`)
    XLSX.writeFile(wb, `결제요청_${monthKey}.xlsx`)
  }

  return (
    <main className="flex-1 max-w-3xl w-full mx-auto px-4 pb-32 pt-4">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 -mx-4 px-4 pt-3 pb-3 mb-3 bg-[#0c0d12]/85 backdrop-blur border-b border-white/5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold tracking-tight">💸 결제요청</h1>
            <p className="text-[11px] text-zinc-500">브리시엘 비품 결제 관리</p>
          </div>
          <div className="flex items-center gap-1.5">
            {!pushSubscribed && (
              <button
                onClick={enablePushNotifications}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
              >
                🔔 알림 켜기
              </button>
            )}
            <button
              onClick={exportExcel}
              disabled={filtered.length === 0}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40"
            >
              📥 엑셀
            </button>
          </div>
        </div>

        {/* 월 선택 + 합계 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            className="text-sm bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-amber-500/50"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>{m.replace('-', '년 ')}월</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="px-2 py-1 rounded-md bg-rose-500/15 text-rose-300">
              대기 {grouped.대기.length}
            </span>
            <span className="px-2 py-1 rounded-md bg-amber-500/15 text-amber-300">
              결제중 {grouped.결제중.length}
            </span>
            <span className="px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300">
              완료 {grouped.완료.length}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
          <span className="text-zinc-400">이번 달 합계</span>
          <span className="text-base font-bold text-white">{formatWon(totals.전체)}</span>
          <span className="text-zinc-500">·</span>
          <span className="text-zinc-400">완료</span>
          <span className="text-emerald-300 font-semibold">{formatWon(totals.완료금액)}</span>
          <span className="text-zinc-500">·</span>
          <span className="text-zinc-400">대기</span>
          <span className="text-rose-300 font-semibold">{formatWon(totals.대기금액)}</span>
        </div>
      </header>

      {/* + 새 요청 */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold shadow-lg shadow-amber-900/30 active:scale-[0.99] transition"
        >
          + 새 결제 요청
        </button>
      )}

      {showForm && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-amber-200">새 결제 요청</h2>
            <button
              onClick={() => setShowForm(false)}
              className="text-zinc-400 hover:text-white text-lg leading-none"
            >×</button>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400">제목 *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="예: 사무실 A4 용지"
              className="mt-0.5 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-zinc-400">금액 (원)</label>
              <input
                inputMode="numeric"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="15000"
                className="mt-0.5 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400">결제수단</label>
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as Method })}
                className="mt-0.5 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-amber-500/50"
              >
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400">
              {form.method === '계좌이체' ? '계좌번호 (은행/계좌번호/예금주)' : '결제 링크 (URL)'}
            </label>
            <input
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder={form.method === '계좌이체' ? '국민 123-45-6789 홍길동' : 'https://...'}
              className="mt-0.5 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-zinc-400">요청자</label>
              <input
                value={form.requester}
                onChange={(e) => setForm({ ...form, requester: e.target.value })}
                placeholder="이름"
                className="mt-0.5 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400">메모</label>
              <input
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                placeholder="(선택)"
                className="mt-0.5 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          <button
            onClick={addRequest}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold disabled:opacity-50"
          >
            {submitting ? '등록 중...' : '등록하기 (+ 카톡 공유)'}
          </button>
        </div>
      )}

      {/* 목록 */}
      <section className="mt-4 space-y-5">
        {loading && <div className="text-center text-zinc-500 py-8">불러오는 중...</div>}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-zinc-500">
            <div className="text-4xl mb-2">🗂️</div>
            <p className="text-sm">이번 달 결제 요청이 없습니다</p>
          </div>
        )}

        {(['대기', '결제중', '완료'] as Status[]).map((status) => {
          const list = grouped[status]
          if (list.length === 0) return null
          return (
            <div key={status}>
              <h3 className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
                {status} ({list.length})
              </h3>
              <div className="space-y-2">
                {list.map((req) => (
                  <RequestCard
                    key={req.id}
                    req={req}
                    editing={editingId === req.id}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    onEditStart={() => startEdit(req)}
                    onEditCancel={() => setEditingId(null)}
                    onEditSave={saveEdit}
                    onDelete={() => deleteRequest(req.id)}
                    onOpenLink={() => openLink(req)}
                    onComplete={() => markCompleted(req.id)}
                    onRevert={() => revertToWaiting(req.id)}
                    onShare={() => shareToKakao(req)}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {/* 결제수단별 합계 */}
        {!loading && filtered.length > 0 && (
          <div className="mt-6 p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
            <h3 className="text-xs font-semibold text-zinc-400 mb-3">결제수단별 완료 합계</h3>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => (
                <div key={m} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/50">
                  <span className={`text-xs px-2 py-0.5 rounded-md ${METHOD_STYLE[m]}`}>{m}</span>
                  <span className="text-sm font-semibold">{formatWon(totals.methodSums[m])}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 토스트 */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-50 px-4 py-2.5 rounded-full bg-zinc-100 text-zinc-900 text-sm font-medium shadow-xl">
          {toast}
        </div>
      )}
    </main>
  )
}

// ─────────────────────────────────────────────
// 카드 컴포넌트
// ─────────────────────────────────────────────

type EditForm = {
  title: string
  amount: string
  method: Method
  link: string
  memo: string
  requester: string
}

function RequestCard({
  req, editing, editForm, setEditForm,
  onEditStart, onEditCancel, onEditSave, onDelete,
  onOpenLink, onComplete, onRevert, onShare,
}: {
  req: PaymentRequest
  editing: boolean
  editForm: EditForm
  setEditForm: (f: EditForm) => void
  onEditStart: () => void
  onEditCancel: () => void
  onEditSave: () => void
  onDelete: () => void
  onOpenLink: () => void
  onComplete: () => void
  onRevert: () => void
  onShare: () => void
}) {
  if (editing) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
        <input
          value={editForm.title}
          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
          className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-amber-500/50"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            inputMode="numeric"
            value={editForm.amount}
            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value.replace(/[^0-9]/g, '') })}
            className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-amber-500/50"
          />
          <select
            value={editForm.method}
            onChange={(e) => setEditForm({ ...editForm, method: e.target.value as Method })}
            className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-amber-500/50"
          >
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <input
          value={editForm.link}
          onChange={(e) => setEditForm({ ...editForm, link: e.target.value })}
          placeholder="링크/계좌"
          className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-amber-500/50"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={editForm.requester}
            onChange={(e) => setEditForm({ ...editForm, requester: e.target.value })}
            placeholder="요청자"
            className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-amber-500/50"
          />
          <input
            value={editForm.memo}
            onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
            placeholder="메모"
            className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-amber-500/50"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onEditCancel}
            className="py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
          >
            취소
          </button>
          <button
            onClick={onEditSave}
            className="py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-bold"
          >
            저장
          </button>
        </div>
      </div>
    )
  }

  const isDone = req.status === '완료'
  const isProgress = req.status === '결제중'

  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        isDone
          ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
          : isProgress
          ? 'border-amber-500/30 bg-amber-500/[0.04]'
          : 'border-white/10 bg-zinc-900/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${METHOD_STYLE[req.method]}`}>
              {req.method}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_BADGE[req.status]}`}>
              {req.status}
            </span>
            {req.requester && (
              <span className="text-[10px] text-zinc-400">· {req.requester}</span>
            )}
          </div>
          <h4 className={`mt-1.5 font-semibold leading-tight ${isDone ? 'line-through text-zinc-500' : 'text-white'}`}>
            {req.title}
          </h4>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className={`text-lg font-bold ${isDone ? 'text-zinc-500' : 'text-amber-300'}`}>
              {formatWon(req.amount)}
            </span>
            <span className="text-[10px] text-zinc-500">{formatDate(req.created_at)}</span>
          </div>
          {req.memo && <p className="mt-1 text-xs text-zinc-400">📝 {req.memo}</p>}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onEditStart}
            className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 text-zinc-400 text-xs"
            title="수정"
          >✏️</button>
          <button
            onClick={onDelete}
            className="w-7 h-7 rounded-md bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 text-sm"
            title="삭제"
          >×</button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {!isDone && req.link && (
          <button
            onClick={onOpenLink}
            className="col-span-2 py-2.5 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-bold text-sm shadow-md shadow-blue-900/30 active:scale-[0.99]"
          >
            {req.method === '계좌이체' ? '💳 계좌번호 복사 + 결제중으로' : '🔗 결제 링크 열기'}
          </button>
        )}
        {!isDone && (
          <button
            onClick={onComplete}
            className="py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold"
          >
            ✓ 완료
          </button>
        )}
        {!isDone && (
          <button
            onClick={onShare}
            className="py-2 rounded-lg bg-yellow-400/15 hover:bg-yellow-400/25 text-yellow-200 border border-yellow-400/30 text-xs font-semibold"
          >
            💬 카톡 공유
          </button>
        )}
        {isDone && (
          <button
            onClick={onRevert}
            className="col-span-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 text-xs"
          >
            ↺ 대기로 되돌리기
          </button>
        )}
      </div>
    </div>
  )
}

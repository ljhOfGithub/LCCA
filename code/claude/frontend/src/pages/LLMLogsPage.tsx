import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

interface TokenUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  [key: string]: number | undefined
}

interface ScoreRunLogEntry {
  score_run_id: string
  attempt_id: string | null
  task_response_id: string
  task_id: string
  task_title: string
  task_type: string
  scenario_title: string
  student_number: string | null
  student_name: string | null
  prompt_template_name: string | null
  rendered_system_prompt: string | null
  rendered_user_prompt: string | null
  llm_model: string | null
  llm_token_usage: string | null
  raw_llm_response: string | null
  status: string
  run_started_at: string | null
  run_completed_at: string | null
  error_message: string | null
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-50 text-green-700 border-green-200',
  running:   'bg-blue-50 text-blue-700 border-blue-200',
  failed:    'bg-red-50 text-red-700 border-red-200',
  pending:   'bg-gray-100 text-gray-600 border-gray-200',
}

const TASK_TYPE_COLORS: Record<string, string> = {
  reading: 'bg-sky-50 text-sky-700',
  writing: 'bg-violet-50 text-violet-700',
  listening: 'bg-amber-50 text-amber-700',
  speaking: 'bg-rose-50 text-rose-700',
}

const TASK_TYPE_LABELS: Record<string, string> = {
  reading: 'Reading', writing: 'Writing', listening: 'Listening', speaking: 'Speaking',
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function durationMs(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  return new Date(end).getTime() - new Date(start).getTime()
}

function fmtDuration(ms: number | null) {
  if (ms === null) return null
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`
}

function prettyJson(raw: string | null): string {
  if (!raw) return ''
  try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
}

function parseUsage(raw: string | null): TokenUsage | null {
  if (!raw) return null
  try { return JSON.parse(raw) as TokenUsage } catch { return null }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">{children}</p>
}

function CodeBlock({ content, maxHeight = 'max-h-72', accent = 'border-gray-200 bg-white' }: {
  content: string | null; maxHeight?: string; accent?: string
}) {
  if (!content) return <p className="text-xs italic text-gray-400">未记录</p>
  return (
    <pre className={`text-xs font-mono whitespace-pre-wrap leading-relaxed p-3 rounded-lg border ${accent} ${maxHeight} overflow-y-auto text-gray-800`}>
      {content}
    </pre>
  )
}

function TokenBadge({ label, value, color }: { label: string; value: number | undefined; color: string }) {
  if (value === undefined) return null
  return (
    <div className={`rounded-lg px-3 py-2 text-center ${color}`}>
      <p className="text-xs opacity-70 mb-0.5">{label}</p>
      <p className="text-base font-bold tabular-nums">{value.toLocaleString()}</p>
    </div>
  )
}

// ── Single task log card ───────────────────────────────────────────────────────

function LogCard({ entry }: { entry: ScoreRunLogEntry }) {
  const [open, setOpen] = useState(false)
  const isDefault = entry.prompt_template_name?.startsWith('[default:') ?? false
  const ms = durationMs(entry.run_started_at, entry.run_completed_at)
  const usage = parseUsage(entry.llm_token_usage)

  return (
    <div className={`border rounded-lg overflow-hidden transition-shadow ${open ? 'shadow-sm border-gray-300' : 'border-gray-200'} bg-white`}>
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <svg className={`w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800 truncate">{entry.task_title}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TASK_TYPE_COLORS[entry.task_type] ?? 'bg-gray-100 text-gray-500'}`}>
              {TASK_TYPE_LABELS[entry.task_type] ?? entry.task_type}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${STATUS_STYLES[entry.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
              {entry.status}
            </span>
          </div>
        </div>

        <div className="flex-shrink-0 text-right space-y-1">
          <div className="flex items-center gap-1 justify-end">
            {entry.llm_model && (
              <span className="text-xs font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                {entry.llm_model}
              </span>
            )}
            {entry.prompt_template_name && (
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${isDefault ? 'bg-gray-100 text-gray-500' : 'bg-purple-50 text-purple-700'}`}>
                {entry.prompt_template_name}
              </span>
            )}
          </div>
          {usage?.total_tokens && (
            <p className="text-xs text-gray-400 tabular-nums">{usage.total_tokens.toLocaleString()} tokens</p>
          )}
          {fmtDuration(ms) && <p className="text-xs text-gray-400">耗时 {fmtDuration(ms)}</p>}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {entry.error_message && (
            <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <p className="font-semibold mb-1">错误信息</p>
              <pre className="whitespace-pre-wrap font-mono">{entry.error_message}</pre>
            </div>
          )}
          <div className="p-4 space-y-4">
            <div>
              <SectionLabel>调用元数据</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  ['模型', entry.llm_model ?? '—', 'font-mono'],
                  ['Prompt 模板', entry.prompt_template_name ?? '—', isDefault ? 'text-gray-500' : 'text-purple-700'],
                  ['开始时间', fmt(entry.run_started_at), ''],
                  ['完成 / 耗时', `${fmt(entry.run_completed_at)}${fmtDuration(ms) ? `\n${fmtDuration(ms)}` : ''}`, ''],
                ].map(([label, val, cls]) => (
                  <div key={label as string} className="bg-gray-50 rounded px-2.5 py-2">
                    <p className="text-gray-400 mb-0.5">{label}</p>
                    <p className={`font-medium text-gray-800 break-all whitespace-pre-line ${cls}`}>{val}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel>Token 用量</SectionLabel>
              {usage ? (
                <div className="grid grid-cols-3 gap-2">
                  <TokenBadge label="Prompt" value={usage.prompt_tokens} color="bg-indigo-50 text-indigo-700" />
                  <TokenBadge label="Completion" value={usage.completion_tokens} color="bg-blue-50 text-blue-700" />
                  <TokenBadge label="Total" value={usage.total_tokens} color="bg-slate-100 text-slate-700" />
                  {Object.entries(usage)
                    .filter(([k]) => !['prompt_tokens','completion_tokens','total_tokens'].includes(k))
                    .map(([k, v]) => <TokenBadge key={k} label={k} value={v} color="bg-gray-50 text-gray-600" />)}
                </div>
              ) : <p className="text-xs italic text-gray-400">未记录</p>}
            </div>
            <div>
              <SectionLabel>System Prompt</SectionLabel>
              <CodeBlock content={entry.rendered_system_prompt} maxHeight="max-h-48" accent="border-indigo-100 bg-indigo-50/30" />
            </div>
            <div>
              <SectionLabel>User Prompt</SectionLabel>
              <CodeBlock content={entry.rendered_user_prompt} maxHeight="max-h-80" accent="border-blue-100 bg-blue-50/30" />
            </div>
            <div>
              <SectionLabel>LLM 回传（评分 JSON）</SectionLabel>
              <CodeBlock content={prettyJson(entry.raw_llm_response)} maxHeight="max-h-64" accent="border-green-100 bg-green-50/30" />
            </div>
            <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
              Score Run: <span className="font-mono">{entry.score_run_id}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Attempt group ──────────────────────────────────────────────────────────────

function AttemptGroup({ entries, defaultOpen }: {
  entries: ScoreRunLogEntry[]
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const first = entries[0]

  // Sort entries by task type order for display
  const TYPE_ORDER: Record<string, number> = { reading: 0, writing: 1, listening: 2, speaking: 3 }
  const sorted = [...entries].sort((a, b) => (TYPE_ORDER[a.task_type] ?? 9) - (TYPE_ORDER[b.task_type] ?? 9))

  const totalTokens = entries.reduce((s, e) => s + (parseUsage(e.llm_token_usage)?.total_tokens ?? 0), 0)
  const hasError = entries.some(e => e.status === 'failed')

  // Status summary chips
  const statusCounts = entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Attempt header */}
      <button
        className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors
          ${open ? 'bg-blue-50 border-b border-blue-100' : 'bg-gray-50 hover:bg-gray-100'}`}
        onClick={() => setOpen(o => !o)}
      >
        <svg className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        {/* Student info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm">
              {first.student_name || '未知学生'}
            </span>
            {first.student_number && (
              <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600">
                {first.student_number}
              </span>
            )}
            {hasError && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">含错误</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{first.scenario_title}</p>
        </div>

        {/* Right meta */}
        <div className="flex-shrink-0 text-right space-y-1">
          <div className="flex items-center gap-1.5 justify-end">
            {Object.entries(statusCounts).map(([s, n]) => (
              <span key={s} className={`text-[11px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[s] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                {s} ×{n}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400">{fmt(first.created_at)}</p>
          {totalTokens > 0 && (
            <p className="text-xs text-gray-400 tabular-nums">{totalTokens.toLocaleString()} tokens</p>
          )}
        </div>
      </button>

      {/* Task cards */}
      {open && (
        <div className="divide-y divide-gray-100 px-4 py-3 space-y-2">
          {sorted.map(e => <LogCard key={e.score_run_id} entry={e} />)}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function LLMLogsPage() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<ScoreRunLogEntry[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [taskTypeFilter, setTaskTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [studentNumberInput, setStudentNumberInput] = useState('')
  const [studentNameInput, setStudentNameInput] = useState('')
  const [studentNumberFilter, setStudentNumberFilter] = useState('')
  const [studentNameFilter, setStudentNameFilter] = useState('')

  const PER_PAGE = 100  // load more per page since we group by attempt

  const load = useCallback(async (p: number, replace: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) })
      if (taskTypeFilter) params.set('task_type', taskTypeFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (studentNumberFilter) params.set('student_number', studentNumberFilter)
      if (studentNameFilter) params.set('student_name', studentNameFilter)
      const r = await apiClient.get(`/teacher/review/score-runs?${params}`)
      const data: ScoreRunLogEntry[] = r.data
      setEntries(prev => replace ? data : [...prev, ...data])
      setHasMore(data.length === PER_PAGE)
    } catch {
      setError('加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }, [taskTypeFilter, statusFilter, studentNumberFilter, studentNameFilter])

  useEffect(() => { setPage(1); load(1, true) }, [load])

  const applyStudentFilter = () => {
    setStudentNumberFilter(studentNumberInput.trim())
    setStudentNameFilter(studentNameInput.trim())
  }

  const clearStudentFilter = () => {
    setStudentNumberInput(''); setStudentNameInput('')
    setStudentNumberFilter(''); setStudentNameFilter('')
  }

  // Group by attempt_id (fall back to score_run_id for orphans)
  const grouped: Record<string, ScoreRunLogEntry[]> = {}
  for (const e of entries) {
    const key = e.attempt_id ?? `__orphan_${e.score_run_id}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(e)
  }
  // Sort groups by most recent created_at
  const attemptKeys = Object.keys(grouped).sort((a, b) => {
    const aDate = grouped[a][0]?.created_at ?? ''
    const bDate = grouped[b][0]?.created_at ?? ''
    return bDate.localeCompare(aDate)
  })

  const totalTokens = entries.reduce((s, e) => s + (parseUsage(e.llm_token_usage)?.total_tokens ?? 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-4 mb-2.5">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="font-bold text-gray-900 leading-tight">LLM 评分日志</h1>
                <p className="text-xs text-gray-500 mt-0.5">按评估次数（Attempt）分组，展开可查看每个 Task 的详情</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{attemptKeys.length} 次评估</p>
              {totalTokens > 0 && (
                <p className="text-xs text-gray-400 tabular-nums">{totalTokens.toLocaleString()} tokens</p>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={taskTypeFilter} onChange={e => setTaskTypeFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">全部类型</option>
              <option value="reading">Reading</option>
              <option value="writing">Writing</option>
              <option value="listening">Listening</option>
              <option value="speaking">Speaking</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">全部状态</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="pending">Pending</option>
            </select>
            <input type="text" placeholder="学号" value={studentNumberInput}
              onChange={e => setStudentNumberInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyStudentFilter()}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-24 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <input type="text" placeholder="姓名" value={studentNameInput}
              onChange={e => setStudentNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyStudentFilter()}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-24 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <button onClick={applyStudentFilter}
              className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">搜索</button>
            {(studentNumberFilter || studentNameFilter) && (
              <button onClick={clearStudentFilter}
                className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100">清除</button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

        {!loading && entries.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">暂无评分日志</p>
          </div>
        )}

        {attemptKeys.map((key, i) => (
          <AttemptGroup key={key} entries={grouped[key]} defaultOpen={i === 0} />
        ))}

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        )}

        {!loading && hasMore && entries.length > 0 && (
          <div className="flex justify-center pt-2 pb-6">
            <button onClick={() => { const next = page + 1; setPage(next); load(next, false) }}
              className="px-6 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-600">
              加载更多
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

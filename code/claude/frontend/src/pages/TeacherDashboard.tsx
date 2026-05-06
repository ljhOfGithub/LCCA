import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import WebmAudioPlayer from '../components/WebmAudioPlayer'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Scenario {
  id: string
  title: string
  status: string
  tasks: unknown[]
}

interface AttemptSummary {
  id: string
  scenario_id: string
  status: string
  started_at: string | null
  submitted_at: string | null
  has_result: boolean
  is_finalized: boolean
  cefr_level: string | null
  overall_score: number | null
  overall_score_max: number | null
  student_id: string | null
  student_number: string | null
  student_name: string | null
  student_email: string | null
}

interface CriterionDetail {
  detail_id: string
  criterion_name: string
  score: number
  max_score: number
  feedback: string
  teacher_score: number | null
  teacher_feedback: string | null
  is_teacher_reviewed: boolean
  cefr_descriptors: Record<string, string> | null
}

interface MaterialDetail {
  material_type: string
  content: string | null
  storage_key: string | null
}

interface TaskDetail {
  task_id: string
  task_type: string
  task_title: string
  task_description: string | null
  sequence_order: number
  weight: number
  content: string | null
  score_run_id: string | null
  prompt_template_name: string | null
  rendered_system_prompt: string | null
  rendered_user_prompt: string | null
  cefr_level: string
  overall_feedback: string
  transcript: string | null
  criteria: CriterionDetail[]
  total_score: number
  total_max: number
  materials: MaterialDetail[]
}

interface AttemptDetail {
  id: string
  scenario_id: string
  scenario_title: string
  status: string
  started_at: string | null
  submitted_at: string | null
  cefr_level: string | null
  overall_score: number | null
  overall_score_max: number | null
  band_score: number | null
  teacher_notes: string | null
  is_finalized: boolean
  student_number: string | null
  student_name: string | null
  student_email: string | null
  tasks: TaskDetail[]
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TeacherDashboard({ userName }: { userName: string }) {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <span className="font-bold text-gray-900">LCCA — Teacher</span>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <button onClick={() => navigate('/teacher/logs')}
            className="flex items-center gap-1.5 px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            LLM 日志
          </button>
          <span className="px-2 py-0.5 bg-teal-50 text-teal-600 rounded text-xs font-medium">Teacher</span>
          <span>{userName}</span>
          <button onClick={() => { localStorage.removeItem('access_token'); navigate('/login') }}
            className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">Logout</button>
        </div>
      </header>
      <main className="flex-1 p-6">
        <ReviewTab />
      </main>
    </div>
  )
}

// ── Shared attempt card ────────────────────────────────────────────────────────

function AttemptCard({ a, action }: { a: AttemptSummary; action: React.ReactNode }) {
  const pct = a.overall_score != null && a.overall_score_max
    ? Math.round((a.overall_score / a.overall_score_max) * 100) : null

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 text-sm">
            {a.student_name || 'Unknown Student'}
          </span>
          {a.student_number && (
            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {a.student_number}
            </span>
          )}
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
            a.status === 'scored' ? 'bg-green-100 text-green-700'
            : a.status === 'submitted' ? 'bg-amber-100 text-amber-700'
            : 'bg-gray-100 text-gray-600'
          }`}>{a.status}</span>
          {a.cefr_level && <span className="font-semibold text-blue-600 text-sm">{a.cefr_level}</span>}
          {pct != null && <span className="text-xs text-gray-500">{pct}%</span>}
          {a.is_finalized && <span className="text-xs text-green-600 font-medium">Finalised</span>}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {a.student_email && <>{a.student_email} · </>}
          {a.submitted_at ? `Submitted ${new Date(a.submitted_at).toLocaleString()}` : 'Not submitted'}
        </p>
      </div>
      <div className="ml-4 flex-shrink-0">{action}</div>
    </div>
  )
}

// ── Student + date filter bar ──────────────────────────────────────────────────

function StudentFilter({ onFilter }: { onFilter: (num: string, name: string, dateFrom: string, dateTo: string) => void }) {
  const [num, setNum] = useState('')
  const [name, setName] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const apply = () => onFilter(num.trim(), name.trim(), dateFrom, dateTo)
  const clear = () => { setNum(''); setName(''); setDateFrom(''); setDateTo(''); onFilter('', '', '', '') }
  const hasFilter = num || name || dateFrom || dateTo

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input value={num} onChange={e => setNum(e.target.value)} onKeyDown={e => e.key === 'Enter' && apply()}
        placeholder="Student number…"
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && apply()}
        placeholder="Student name…"
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <span className="text-xs text-gray-400 ml-1">提交日期</span>
      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <span className="text-xs text-gray-400">—</span>
      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={apply}
        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
        Search
      </button>
      {hasFilter && (
        <button onClick={clear} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
      )}
    </div>
  )
}

// ── Review tab ────────────────────────────────────────────────────────────────

function ReviewTab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [attempts, setAttempts] = useState<AttemptSummary[]>([])
  const [loadingAttempts, setLoadingAttempts] = useState(false)
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptDetail | null>(null)
  const [filterNum, setFilterNum] = useState('')
  const [filterName, setFilterName] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  useEffect(() => {
    apiClient.get('/teacher/published').then(r => {
      const list: Scenario[] = Array.isArray(r.data) ? r.data : (r.data.items || [])
      setScenarios(list)
      if (list.length > 0) loadAttempts(list[0].id, '', '', '', '')
    }).catch(console.error)
  }, [])

  const loadAttempts = async (scenarioId: string, num: string, name: string, dateFrom: string, dateTo: string) => {
    setSelectedScenarioId(scenarioId)
    setAttempts([])
    setSelectedAttempt(null)
    if (!scenarioId) return
    setLoadingAttempts(true)
    try {
      const params: Record<string, string> = {}
      if (num) params.student_number = num
      if (name) params.student_name = name
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const r = await apiClient.get(`/teacher/review/scenarios/${scenarioId}/attempts`, { params })
      setAttempts(r.data)
    } catch (e) { console.error(e) }
    finally { setLoadingAttempts(false) }
  }

  const handleFilter = (num: string, name: string, dateFrom: string, dateTo: string) => {
    setFilterNum(num)
    setFilterName(name)
    setFilterDateFrom(dateFrom)
    setFilterDateTo(dateTo)
    if (selectedScenarioId) loadAttempts(selectedScenarioId, num, name, dateFrom, dateTo)
  }

  const loadAttemptDetail = async (attemptId: string) => {
    try {
      const r = await apiClient.get(`/teacher/review/attempts/${attemptId}`)
      setSelectedAttempt(r.data)
    } catch (e) { console.error(e) }
  }

  if (selectedAttempt) {
    return (
      <AttemptReviewPanel
        attempt={selectedAttempt}
        onBack={() => { setSelectedAttempt(null); loadAttempts(selectedScenarioId, filterNum, filterName, filterDateFrom, filterDateTo) }}
        onReload={() => loadAttemptDetail(selectedAttempt.id)}
      />
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-800">Review Student Results</h2>
        <select value={selectedScenarioId}
          onChange={e => { loadAttempts(e.target.value, filterNum, filterName, filterDateFrom, filterDateTo) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Select a scenario…</option>
          {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>

      {selectedScenarioId && (
        <div className="mb-4">
          <StudentFilter onFilter={handleFilter} />
        </div>
      )}

      {loadingAttempts && <div className="text-center py-8 text-gray-400">Loading…</div>}

      {!loadingAttempts && selectedScenarioId && attempts.length === 0 && (
        <div className="text-center py-12 text-gray-400">No attempts found.</div>
      )}

      <div className="space-y-3">
        {attempts.map(a => (
          <AttemptCard key={a.id} a={a} action={
            <button
              onClick={() => loadAttemptDetail(a.id)}
              disabled={!a.has_result}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${a.has_result
                  ? 'border border-gray-300 hover:bg-gray-50'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              {a.has_result ? 'Review →' : 'Not scored'}
            </button>
          } />
        ))}
      </div>
    </div>
  )
}

function TaskContentDisplay({ content, taskType }: { content: string; taskType: string }) {
  const type = taskType?.toLowerCase() ?? ''

  if (type === 'listening') {
    try {
      const parsed = JSON.parse(content)
      const notes = parsed.notes ?? ''
      const replays = parsed.audioReplayCount ?? 0
      if (!notes) return <p className="text-sm text-gray-400 italic">No notes submitted.</p>
      return (
        <div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">{notes}</p>
          <p className="text-xs text-gray-400 mt-1">Audio replays: {replays}</p>
        </div>
      )
    } catch { /* fall through to raw display */ }
  }

  if (type === 'speaking') {
    try {
      const parsed = JSON.parse(content)
      const keys = parsed.audioKeys ?? Object.values(parsed.recordingMap ?? {})
      return (
        <p className="text-sm text-gray-500 italic">
          Audio recording submitted ({keys.length} clip{keys.length !== 1 ? 's' : ''})
        </p>
      )
    } catch { /* fall through */ }
  }

  if (type === 'writing') {
    const stripped = content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (!stripped) return <p className="text-sm text-gray-400 italic">No response submitted.</p>
    return <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">{stripped}</p>
  }

  return <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">{content}</p>
}

// Audio player for teacher review of speaking tasks
function SpeakingAudioPanel({ content }: { content: string }) {
  const [audioUrls, setAudioUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let keys: string[] = []
    try {
      const parsed = JSON.parse(content)
      if (parsed.recordingMap) keys = Object.values(parsed.recordingMap) as string[]
      else if (parsed.audioKeys) keys = parsed.audioKeys
    } catch { return }

    if (keys.length === 0) { setLoading(false); return }

    Promise.all(
      keys.filter(Boolean).map(key =>
        apiClient.get(`/teacher/review/audio-url?key=${encodeURIComponent(key)}`)
          .then(r => r.data.url as string)
          .catch(() => '')
      )
    ).then(urls => {
      setAudioUrls(urls.filter(Boolean))
      setLoading(false)
    })
  }, [content])

  if (loading) return (
    <div className="px-5 py-3 border-b border-gray-100 text-xs text-gray-400">Loading audio…</div>
  )
  if (audioUrls.length === 0) return null

  return (
    <div className="px-5 py-3 border-b border-gray-100 space-y-2">
      <p className="text-xs font-medium text-gray-500">Student Recordings</p>
      {audioUrls.map((url, i) => (
        <WebmAudioPlayer key={i} src={url} label={audioUrls.length > 1 ? `Recording ${i + 1}` : undefined} />
      ))}
    </div>
  )
}

// ── Attempt review panel ───────────────────────────────────────────────────────

function AttemptReviewPanel({ attempt, onBack, onReload }: {
  attempt: AttemptDetail; onBack: () => void; onReload: () => void
}) {
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Record<string, { score: string; feedback: string }>>({})
  const [finalizing, setFinalizing] = useState(false)
  const [cefrOverride, setCefrOverride] = useState(attempt.cefr_level || '')
  const [teacherNotes, setTeacherNotes] = useState(attempt.teacher_notes || '')

  const startEdit = (c: CriterionDetail) =>
    setEditing(prev => ({ ...prev, [c.detail_id]: { score: String(c.teacher_score ?? c.score), feedback: c.teacher_feedback ?? c.feedback } }))

  const cancelEdit = (id: string) =>
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n })

  const saveEdit = async (c: CriterionDetail) => {
    const ed = editing[c.detail_id]
    if (!ed) return
    setSaving(prev => ({ ...prev, [c.detail_id]: true }))
    try {
      await apiClient.patch(`/teacher/review/score-details/${c.detail_id}`, {
        teacher_score: parseFloat(ed.score),
        teacher_feedback: ed.feedback,
        is_teacher_reviewed: true,
      })
      cancelEdit(c.detail_id)
      onReload()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(prev => ({ ...prev, [c.detail_id]: false }))
    }
  }

  const handleFinalize = async () => {
    if (!confirm('Finalize this result? The student will see the final score.')) return
    setFinalizing(true)
    try {
      await apiClient.post(`/teacher/review/attempts/${attempt.id}/finalize`, {
        cefr_level: cefrOverride || undefined,
        teacher_notes: teacherNotes || undefined,
      })
      onReload()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Finalize failed')
    } finally {
      setFinalizing(false)
    }
  }

  const totalScore = attempt.overall_score ?? 0
  const totalMax = attempt.overall_score_max ?? 0
  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0

  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString() : '—'

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-4">← All Attempts</button>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        {/* Scenario + attempt meta */}
        <div className="mb-4 pb-4 border-b border-gray-100">
          <p className="text-xs text-gray-400 mb-0.5">Scenario</p>
          <p className="font-semibold text-gray-800">{attempt.scenario_title}</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-500">
            <div><span className="block text-gray-400">Status</span><span className="capitalize font-medium text-gray-700">{attempt.status}</span></div>
            <div><span className="block text-gray-400">Started</span><span>{fmtDate(attempt.started_at)}</span></div>
            <div><span className="block text-gray-400">Submitted</span><span>{fmtDate(attempt.submitted_at)}</span></div>
            <div><span className="block text-gray-400">Overall</span>
              {totalMax > 0
                ? <span className="font-medium text-gray-700">{pct}% · {totalScore.toFixed(1)}/{totalMax} pts</span>
                : <span>—</span>}
            </div>
          </div>
        </div>

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="font-semibold text-gray-900 text-lg">
                {attempt.student_name || 'Unknown Student'}
              </h2>
              {attempt.student_number && (
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{attempt.student_number}</span>
              )}
              {attempt.student_email && (
                <span className="text-xs text-gray-400">{attempt.student_email}</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <span className={`px-2 py-0.5 rounded font-medium text-xs ${
                attempt.is_finalized ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>{attempt.is_finalized ? 'Finalised' : 'Pending review'}</span>
              {attempt.cefr_level && <span className="text-blue-700 font-bold text-lg">{attempt.cefr_level}</span>}
              {totalMax > 0 && <span className="text-gray-600">{pct}% ({totalScore.toFixed(1)} / {totalMax} pts)</span>}
            </div>
          </div>
        </div>

        {!attempt.is_finalized && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            <div className="flex gap-4 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Override CEFR Level</label>
                <select value={cefrOverride} onChange={e => setCefrOverride(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Keep AI result</option>
                  {['A1','A2','B1','B2','C1','C2'].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-48">
                <label className="block text-xs font-medium text-gray-600 mb-1">Teacher Notes</label>
                <input value={teacherNotes} onChange={e => setTeacherNotes(e.target.value)}
                  placeholder="Optional notes for student…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <button onClick={handleFinalize} disabled={finalizing}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {finalizing ? 'Finalising…' : 'Finalise & Release to Student'}
            </button>
          </div>
        )}

        {attempt.is_finalized && attempt.teacher_notes && (
          <p className="mt-3 text-sm text-gray-600"><span className="font-medium">Notes: </span>{attempt.teacher_notes}</p>
        )}
      </div>

      <div className="space-y-5">
        {attempt.tasks.map(task => (
          <div key={task.task_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Task header */}
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">
                      Task {task.sequence_order + 1} · {task.task_type.charAt(0).toUpperCase() + task.task_type.slice(1)}
                    </span>
                    <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">
                      Weight {Math.round(task.weight * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{task.task_title}</p>
                  {task.task_description && (
                    <p className="text-xs text-gray-400 mt-1 max-w-xl">{task.task_description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm flex-shrink-0">
                  <span className="font-semibold text-gray-700">{task.cefr_level}</span>
                  <span className="text-gray-500">{task.total_score.toFixed(1)} / {task.total_max} pts</span>
                </div>
              </div>
            </div>

            {/* Task materials (scenario content) */}
            {task.materials.length > 0 && (
              <details className="border-b border-gray-100">
                <summary className="px-5 py-2 text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-50 select-none">
                  Task Content ({task.materials.length} material{task.materials.length > 1 ? 's' : ''})
                </summary>
                <div className="px-5 pb-3 space-y-2">
                  {task.materials.map((m, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-400 mb-1 capitalize">{m.material_type.replace('_', ' ')}</p>
                      {m.material_type === 'audio' ? (
                        <audio controls src={m.content ?? undefined} className="w-full mt-1 rounded" />
                      ) : (
                        <>
                          {m.content && <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.content}</p>}
                          {!m.content && m.storage_key && (
                            <p className="text-xs text-gray-400 italic">File: {m.storage_key.split('/').pop()}</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Prompt used — expandable, always shown for scored tasks */}
            {task.score_run_id && (
              <details className="border-b border-gray-100 group">
                <summary className="px-5 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-gray-50 select-none list-none">
                  <svg className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-xs text-gray-500 font-medium">Prompt 详情</span>
                  {task.prompt_template_name && (
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      task.prompt_template_name.startsWith('[default:')
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-purple-50 text-purple-700'
                    }`}>
                      {task.prompt_template_name}
                    </span>
                  )}
                </summary>
                <div className="px-5 pb-4 space-y-3 bg-gray-50">
                  {task.rendered_system_prompt ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 pt-3">System Prompt</p>
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white border border-gray-200 rounded-lg p-3 max-h-64 overflow-y-auto leading-relaxed">
                        {task.rendered_system_prompt}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic pt-3">System prompt 未记录（旧评分记录）</p>
                  )}
                  {task.rendered_user_prompt ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">User Prompt</p>
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white border border-gray-200 rounded-lg p-3 max-h-96 overflow-y-auto leading-relaxed">
                        {task.rendered_user_prompt}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">User prompt 未记录（旧评分记录）</p>
                  )}
                </div>
              </details>
            )}

            {/* AI overall feedback */}
            {task.overall_feedback && (
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800">
                {task.overall_feedback}
              </div>
            )}

            {/* Student response */}
            {task.content && (
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Student Response</p>
                <TaskContentDisplay content={task.content} taskType={task.task_type} />
              </div>
            )}

            {/* Speaking audio player */}
            {task.task_type === 'speaking' && task.content && (
              <SpeakingAudioPanel content={task.content} />
            )}

            {/* Transcript */}
            {task.transcript && (
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Transcript</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.transcript}</p>
              </div>
            )}

            {/* Criteria with CEFR bands */}
            <div className="divide-y divide-gray-100">
              {task.criteria.map(c => {
                const ed = editing[c.detail_id]
                const isSaving = saving[c.detail_id]
                return (
                  <div key={c.detail_id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-sm font-medium text-gray-700">{c.criterion_name}</span>
                          {c.is_teacher_reviewed && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Reviewed</span>
                          )}
                        </div>
                        {!ed && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {c.is_teacher_reviewed && c.teacher_feedback ? c.teacher_feedback : c.feedback}
                          </p>
                        )}
                        {/* CEFR band descriptors */}
                        {c.cefr_descriptors && Object.keys(c.cefr_descriptors).length > 0 && (
                          <details className="mt-1">
                            <summary className="text-xs text-blue-500 cursor-pointer hover:text-blue-700">Band descriptors</summary>
                            <div className="mt-1 grid grid-cols-2 gap-1">
                              {Object.entries(c.cefr_descriptors).map(([band, desc]) => (
                                <div key={band} className="bg-gray-50 rounded px-2 py-1 text-xs">
                                  <span className="font-semibold text-gray-600">{band}: </span>
                                  <span className="text-gray-500">{desc}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm text-gray-700 font-medium">
                          {(c.teacher_score ?? c.score).toFixed(1)} / {c.max_score}
                        </span>
                        {!ed && !attempt.is_finalized && (
                          <button onClick={() => startEdit(c)}
                            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">Edit</button>
                        )}
                      </div>
                    </div>

                    {ed && (
                      <div className="mt-2 space-y-2 bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-gray-600 w-20">Score (/{c.max_score})</label>
                          <input type="number" step="0.5" min="0" max={c.max_score} value={ed.score}
                            onChange={e => setEditing(prev => ({ ...prev, [c.detail_id]: { ...prev[c.detail_id], score: e.target.value } }))}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">Feedback</label>
                          <textarea value={ed.feedback} rows={2}
                            onChange={e => setEditing(prev => ({ ...prev, [c.detail_id]: { ...prev[c.detail_id], feedback: e.target.value } }))}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(c)} disabled={isSaving}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                            {isSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => cancelEdit(c.detail_id)}
                            className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


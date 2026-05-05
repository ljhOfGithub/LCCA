import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

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
}

interface TaskDetail {
  task_id: string
  task_type: string
  task_title: string
  content: string | null
  score_run_id: string | null
  cefr_level: string
  overall_feedback: string
  transcript: string | null
  criteria: CriterionDetail[]
  total_score: number
  total_max: number
}

interface AttemptDetail {
  id: string
  status: string
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

interface ScoreResult {
  attempt_id: string
  cefr_level: string
  overall_score: number
  overall_score_max: number
  task_results: {
    task_type: string
    score: number
    max_score: number
    cefr_level: string
    overall_feedback: string
  }[]
}

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = 'scoring' | 'review'

export default function TeacherDashboard({ userName }: { userName: string }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('review')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-gray-900">LCCA — Teacher</span>
          <nav className="flex gap-1">
            {(['scoring', 'review'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors
                  ${tab === t ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t === 'scoring' ? 'Score Attempts' : 'Review Results'}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="px-2 py-0.5 bg-teal-50 text-teal-600 rounded text-xs font-medium">Teacher</span>
          <span>{userName}</span>
          <button onClick={() => { localStorage.removeItem('access_token'); navigate('/login') }}
            className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">Logout</button>
        </div>
      </header>
      <main className="flex-1 p-6">
        {tab === 'scoring' && <ScoringTab />}
        {tab === 'review' && <ReviewTab />}
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

// ── Student filter bar ─────────────────────────────────────────────────────────

function StudentFilter({ onFilter }: { onFilter: (num: string, name: string) => void }) {
  const [num, setNum] = useState('')
  const [name, setName] = useState('')

  const apply = () => onFilter(num.trim(), name.trim())
  const clear = () => { setNum(''); setName(''); onFilter('', '') }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input value={num} onChange={e => setNum(e.target.value)} onKeyDown={e => e.key === 'Enter' && apply()}
        placeholder="Student number…"
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && apply()}
        placeholder="Student name…"
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={apply}
        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
        Search
      </button>
      {(num || name) && (
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

  useEffect(() => {
    apiClient.get('/teacher/published').then(r => {
      const list: Scenario[] = Array.isArray(r.data) ? r.data : (r.data.items || [])
      setScenarios(list)
      if (list.length > 0) loadAttempts(list[0].id, '', '')
    }).catch(console.error)
  }, [])

  const loadAttempts = async (scenarioId: string, num: string, name: string) => {
    setSelectedScenarioId(scenarioId)
    setAttempts([])
    setSelectedAttempt(null)
    if (!scenarioId) return
    setLoadingAttempts(true)
    try {
      const params: Record<string, string> = {}
      if (num) params.student_number = num
      if (name) params.student_name = name
      const r = await apiClient.get(`/teacher/review/scenarios/${scenarioId}/attempts`, { params })
      setAttempts(r.data)
    } catch (e) { console.error(e) }
    finally { setLoadingAttempts(false) }
  }

  const handleFilter = (num: string, name: string) => {
    setFilterNum(num)
    setFilterName(name)
    if (selectedScenarioId) loadAttempts(selectedScenarioId, num, name)
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
        onBack={() => { setSelectedAttempt(null); loadAttempts(selectedScenarioId, filterNum, filterName) }}
        onReload={() => loadAttemptDetail(selectedAttempt.id)}
      />
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-800">Review Student Results</h2>
        <select value={selectedScenarioId}
          onChange={e => { loadAttempts(e.target.value, filterNum, filterName) }}
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
    const stripped = content.replace(/<[^>]*>/g, '').trim()
    if (!stripped) return <p className="text-sm text-gray-400 italic">No response submitted.</p>
    return <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">{stripped}</p>
  }

  return <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">{content}</p>
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

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-4">← All Attempts</button>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
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
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <span className="font-semibold text-gray-800">{task.task_title}</span>
                <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{task.task_type}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-gray-700">{task.cefr_level}</span>
                <span className="text-gray-500">{task.total_score.toFixed(1)} / {task.total_max} pts</span>
              </div>
            </div>

            {task.overall_feedback && (
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800">
                {task.overall_feedback}
              </div>
            )}

            {task.content && (
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Student Response</p>
                <TaskContentDisplay content={task.content} taskType={task.task_type} />
              </div>
            )}

            {task.transcript && (
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Transcript</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.transcript}</p>
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {task.criteria.map(c => {
                const ed = editing[c.detail_id]
                const isSaving = saving[c.detail_id]
                return (
                  <div key={c.detail_id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
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

// ── Scoring tab ────────────────────────────────────────────────────────────────

function ScoringTab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [attempts, setAttempts] = useState<AttemptSummary[]>([])
  const [scoring, setScoring] = useState<Record<string, 'idle' | 'loading' | 'done'>>({})
  const [scoredResults, setScoredResults] = useState<Record<string, ScoreResult>>({})
  const [loadingAttempts, setLoadingAttempts] = useState(false)
  const [filterNum, setFilterNum] = useState('')
  const [filterName, setFilterName] = useState('')

  useEffect(() => {
    apiClient.get('/teacher/published').then(r => {
      const list: Scenario[] = Array.isArray(r.data) ? r.data : (r.data.items || [])
      setScenarios(list)
      if (list.length > 0) loadAttempts(list[0].id, '', '')
    }).catch(console.error)
  }, [])

  const loadAttempts = async (scenarioId: string, num: string, name: string) => {
    setSelectedScenarioId(scenarioId)
    setAttempts([])
    setScoredResults({})
    if (!scenarioId) return
    setLoadingAttempts(true)
    try {
      const params: Record<string, string> = { status: 'submitted' }
      if (num) params.student_number = num
      if (name) params.student_name = name
      const r = await apiClient.get(`/teacher/review/scenarios/${scenarioId}/attempts`, { params })
      const all: AttemptSummary[] = r.data
      setAttempts(all.filter(a => !a.has_result))
    } catch (e) { console.error(e) }
    finally { setLoadingAttempts(false) }
  }

  const handleFilter = (num: string, name: string) => {
    setFilterNum(num)
    setFilterName(name)
    if (selectedScenarioId) loadAttempts(selectedScenarioId, num, name)
  }

  const scoreAttempt = async (attemptId: string) => {
    setScoring(prev => ({ ...prev, [attemptId]: 'loading' }))
    try {
      const r = await apiClient.post(`/scoring/attempt/${attemptId}`)
      setScoredResults(prev => ({ ...prev, [attemptId]: r.data }))
      setScoring(prev => ({ ...prev, [attemptId]: 'done' }))
      setAttempts(prev => prev.filter(a => a.id !== attemptId))
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Scoring failed. Check LLM API key is set.')
      setScoring(prev => ({ ...prev, [attemptId]: 'idle' }))
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-800">Score Submitted Attempts</h2>
        <select value={selectedScenarioId} onChange={e => loadAttempts(e.target.value, filterNum, filterName)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Select a scenario…</option>
          {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        {selectedScenarioId && !loadingAttempts && (
          <button onClick={() => loadAttempts(selectedScenarioId, filterNum, filterName)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Refresh</button>
        )}
      </div>

      {selectedScenarioId && (
        <div className="mb-4">
          <StudentFilter onFilter={handleFilter} />
        </div>
      )}

      {loadingAttempts && <div className="text-center py-8 text-gray-400">Loading attempts…</div>}

      {!loadingAttempts && selectedScenarioId && attempts.length === 0 && Object.keys(scoredResults).length === 0 && (
        <div className="text-center py-12 text-gray-400">No unscored submitted attempts for this scenario.</div>
      )}

      <div className="space-y-4">
        {attempts.map(a => (
          <AttemptCard key={a.id} a={a} action={
            <button onClick={() => scoreAttempt(a.id)} disabled={scoring[a.id] === 'loading'}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                ${scoring[a.id] === 'loading' ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              {scoring[a.id] === 'loading' ? (
                <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>Scoring…</>
              ) : 'Score with AI'}
            </button>
          } />
        ))}

        {Object.entries(scoredResults).map(([id, r]) => (
          <div key={id} className="bg-green-50 border border-green-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-green-900">Attempt {id.slice(0, 8)}… — Scored</p>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-green-700">{r.cefr_level}</span>
                <span className="text-sm text-green-600">{r.overall_score?.toFixed(1)} / {r.overall_score_max?.toFixed(1)} pts</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {r.task_results?.map((t, i) => (
                <div key={i} className="bg-white rounded-lg p-3 text-sm">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium capitalize text-gray-800">{t.task_type}</span>
                    <span className="text-green-700 font-semibold">{t.cefr_level}</span>
                  </div>
                  <div className="text-xs text-gray-500">{t.score?.toFixed(1)} / {t.max_score} pts</div>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-3">{t.overall_feedback}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import WebmAudioPlayer from '../components/WebmAudioPlayer'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CriterionScore {
  detail_id: string
  criterion_name: string
  score: number
  max_score: number
  feedback: string
  teacher_score: number | null
  teacher_feedback: string | null
  is_teacher_reviewed: boolean
  effective_score: number
  cefr_descriptors: Record<string, string> | null
}

interface MaterialResult {
  material_type: string
  content: string | null
  storage_key: string | null
}

interface TaskResult {
  task_id: string
  task_type: string
  task_title: string
  task_description: string | null
  sequence_order: number
  weight: number
  score: number
  max_score: number
  cefr_level: string
  overall_feedback: string
  transcript: string | null
  content: string | null
  criteria: CriterionScore[]
  materials: MaterialResult[]
}

interface AttemptResultDetail {
  attempt_id: string
  scenario_id: string
  scenario_title: string
  status: string
  started_at: string | null
  submitted_at: string | null
  cefr_level: string
  overall_score: number
  overall_score_max: number
  band_score: number | null
  is_finalized: boolean
  teacher_notes: string | null
  task_results: TaskResult[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  reading: 'Reading', writing: 'Writing', listening: 'Listening', speaking: 'Speaking',
}

const CEFR_COLORS: Record<string, string> = {
  A1: 'text-gray-600 bg-gray-100', A2: 'text-blue-600 bg-blue-50',
  B1: 'text-teal-600 bg-teal-50', B2: 'text-green-700 bg-green-100',
  C1: 'text-purple-700 bg-purple-100', C2: 'text-amber-700 bg-amber-100',
  '—': 'text-gray-400 bg-gray-50',
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : '—'
}

function ScoreBar({ score, max, color = 'bg-blue-500' }: { score: number; max: number; color?: string }) {
  const pct = max > 0 ? (score / max) * 100 : 0
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-20 text-right tabular-nums">
        {score.toFixed(1)} / {max}
      </span>
    </div>
  )
}

// Parses student response text by task type
function StudentResponseDisplay({ content, taskType }: { content: string; taskType: string }) {
  const type = taskType.toLowerCase()
  if (type === 'listening') {
    try {
      const p = JSON.parse(content)
      const notes = p.notes ?? ''
      if (!notes) return <p className="text-sm text-gray-400 italic">No notes submitted.</p>
      return (
        <div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
          <p className="text-xs text-gray-400 mt-1">Audio replays used: {p.audioReplayCount ?? 0}</p>
        </div>
      )
    } catch { /* fall through */ }
  }
  if (type === 'speaking') {
    try {
      const p = JSON.parse(content)
      const keys = p.audioKeys ?? Object.values(p.recordingMap ?? {})
      return <p className="text-sm text-gray-500 italic">Audio recording submitted ({keys.length} clip{keys.length !== 1 ? 's' : ''})</p>
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
    return <p className="text-sm text-gray-700 whitespace-pre-wrap">{stripped}</p>
  }
  return <p className="text-sm text-gray-700 whitespace-pre-wrap">{content}</p>
}

// Audio player for speaking task recording playback
function SpeakingAudioSection({ content }: { content: string }) {
  const [audioUrls, setAudioUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let keys: string[] = []
    try {
      const p = JSON.parse(content)
      if (p.recordingMap) keys = Object.values(p.recordingMap) as string[]
      else if (p.audioKeys) keys = p.audioKeys
    } catch { setLoading(false); return }

    if (keys.length === 0) { setLoading(false); return }
    Promise.all(
      keys.filter(Boolean).map((key: string) =>
        apiClient.get(`/scoring/audio-url?key=${encodeURIComponent(key)}`)
          .then(r => r.data.url as string)
          .catch(() => '')
      )
    ).then(urls => { setAudioUrls(urls.filter(Boolean)); setLoading(false) })
  }, [content])

  if (loading) return <p className="text-xs text-gray-400 py-1">Loading audio…</p>
  if (audioUrls.length === 0) return null
  return (
    <div className="space-y-2 mt-2">
      {audioUrls.map((url, i) => (
        <WebmAudioPlayer key={i} src={url} label={audioUrls.length > 1 ? `Recording ${i + 1}` : undefined} />
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const [result, setResult] = useState<AttemptResultDetail | null>(null)
  const [polling, setPolling] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scoringTriggered = useRef(false)
  const startTime = useRef(Date.now())

  const triggerScoring = () => {
    if (scoringTriggered.current) return
    scoringTriggered.current = true
    apiClient.post(`/scoring/attempt/${attemptId}`).catch(console.error)
  }

  const fetchResult = async () => {
    if (Date.now() - startTime.current > 180_000) {
      setError('Scoring is taking longer than expected. Please contact your teacher.')
      setPolling(false); return
    }
    try {
      const r = await apiClient.get(`/scoring/attempt/${attemptId}/result`)
      if (r.data.status === 'pending') {
        triggerScoring()
        return
      }
      setResult(r.data); setPolling(false)
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 400) triggerScoring()
      else { setError('Failed to load results. Please try again.'); setPolling(false) }
    }
  }

  useEffect(() => {
    if (!attemptId) return
    fetchResult()
    pollRef.current = setInterval(fetchResult, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [attemptId])

  useEffect(() => { if (!polling && pollRef.current) clearInterval(pollRef.current) }, [polling])

  if (polling && !result) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6">
        <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-blue-600" />
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800">AI Scoring in Progress</h2>
          <p className="text-sm text-gray-500 mt-2">This usually takes 30–60 seconds. Please wait…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Back to Home</button>
        </div>
      </div>
    )
  }

  if (!result) return null

  const scorePercent = result.overall_score_max > 0
    ? Math.round((result.overall_score / result.overall_score_max) * 100) : 0
  const cefrClass = CEFR_COLORS[result.cefr_level] || CEFR_COLORS['—']

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Assessment Results</h1>
            <p className="text-sm text-gray-500 mt-0.5">{result.scenario_title}</p>
          </div>
          <button onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1 rounded-lg">
            Back to Home
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Attempt metadata */}
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Scenario</p>
            <p className="font-medium text-gray-800 truncate">{result.scenario_title}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Status</p>
            <p className="font-medium capitalize text-gray-800">{result.status}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Started</p>
            <p className="text-gray-600 text-xs">{fmt(result.started_at)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Submitted</p>
            <p className="text-gray-600 text-xs">{fmt(result.submitted_at)}</p>
          </div>
        </div>

        {/* Overall result */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-shrink-0 text-center">
            <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-4xl font-bold ${cefrClass}`}>
              {result.cefr_level}
            </div>
            <p className="text-xs text-gray-500 mt-2">CEFR Level</p>
          </div>
          <div className="flex-1 w-full">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-bold text-gray-900">{scorePercent}%</span>
              <span className="text-gray-500 text-sm">
                ({result.overall_score.toFixed(1)} / {result.overall_score_max} pts)
              </span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${scorePercent}%` }} />
            </div>
            {result.is_finalized
              ? <p className="text-xs text-green-700 mt-2 font-medium">Reviewed and finalised by teacher</p>
              : <p className="text-xs text-amber-600 mt-2">Pending teacher review</p>}
            {result.teacher_notes && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">Teacher notes: </span>{result.teacher_notes}
              </div>
            )}
          </div>
        </div>

        {/* Task breakdown */}
        <h2 className="text-base font-semibold text-gray-700">Task Breakdown</h2>

        {result.task_results.map((task) => {
          const taskPct = task.max_score > 0 ? Math.round((task.score / task.max_score) * 100) : 0
          const taskCefrClass = CEFR_COLORS[task.cefr_level] || CEFR_COLORS['—']
          const taskLabel = `Task ${task.sequence_order + 1} · ${TASK_TYPE_LABELS[task.task_type] ?? task.task_type}`

          return (
            <div key={task.task_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Task header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{taskLabel}</h3>
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                      Weight {Math.round(task.weight * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{task.task_title}</p>
                  {task.task_description && (
                    <p className="text-xs text-gray-400 mt-1">{task.task_description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`px-2.5 py-0.5 rounded-full text-sm font-semibold ${taskCefrClass}`}>
                    {task.cefr_level}
                  </span>
                  <span className="text-sm text-gray-600">{taskPct}%</span>
                </div>
              </div>

              {/* Task materials (collapsible) */}
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
                          m.content && <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.content}</p>
                        )}
                      </div>
                    ))}
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
                  <p className="text-xs font-medium text-gray-500 mb-1">Your Response</p>
                  <StudentResponseDisplay content={task.content} taskType={task.task_type} />
                  {task.task_type === 'speaking' && (
                    <SpeakingAudioSection content={task.content} />
                  )}
                </div>
              )}

              {/* Transcript (speaking) */}
              {task.transcript && (
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-1">Transcript</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.transcript}</p>
                </div>
              )}

              {/* AI scoring detail per criterion */}
              <div className="px-5 py-4 space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Scoring Details</p>
                {task.criteria.map((c) => {
                  const displayScore = c.effective_score
                  const pct = c.max_score > 0 ? (displayScore / c.max_score) * 100 : 0
                  const barColor = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : pct >= 25 ? 'bg-amber-400' : 'bg-red-400'
                  return (
                    <div key={c.detail_id} className="border border-gray-100 rounded-lg overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-700">{c.criterion_name}</span>
                          {c.is_teacher_reviewed && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Teacher adjusted</span>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-gray-700 tabular-nums flex-shrink-0">
                          {displayScore.toFixed(1)} / {c.max_score}
                        </span>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        <ScoreBar score={displayScore} max={c.max_score} color={barColor} />
                        <p className="text-xs text-gray-500 leading-relaxed">
                          {c.is_teacher_reviewed && c.teacher_feedback ? c.teacher_feedback : c.feedback}
                        </p>
                        {/* CEFR band descriptors */}
                        {c.cefr_descriptors && Object.keys(c.cefr_descriptors).length > 0 && (
                          <details className="mt-1">
                            <summary className="text-xs text-blue-500 cursor-pointer hover:text-blue-700 select-none">
                              Band descriptors for this criterion
                            </summary>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                              {Object.entries(c.cefr_descriptors).map(([band, desc]) => (
                                <div key={band} className="bg-gray-50 rounded px-2 py-1.5 text-xs border border-gray-100">
                                  <span className="font-semibold text-indigo-600">{band}: </span>
                                  <span className="text-gray-500">{desc}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </main>
    </div>
  )
}

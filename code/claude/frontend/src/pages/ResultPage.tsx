import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

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
}

interface TaskResult {
  task_id: string
  task_type: string
  task_title: string
  score: number
  max_score: number
  cefr_level: string
  overall_feedback: string
  transcript: string | null
  criteria: CriterionScore[]
}

interface AttemptResultDetail {
  attempt_id: string
  status: string
  cefr_level: string
  overall_score: number
  overall_score_max: number
  band_score: number | null
  is_finalized: boolean
  teacher_notes: string | null
  task_results: TaskResult[]
}

const TASK_TYPE_LABELS: Record<string, string> = {
  reading: 'Task 1 · Reading',
  writing: 'Task 2 · Writing',
  listening: 'Task 3 · Listening',
  speaking: 'Task 4 · Speaking',
}

const CEFR_COLORS: Record<string, string> = {
  A1: 'text-gray-600 bg-gray-100',
  A2: 'text-blue-600 bg-blue-50',
  B1: 'text-teal-600 bg-teal-50',
  B2: 'text-green-700 bg-green-100',
  C1: 'text-purple-700 bg-purple-100',
  C2: 'text-amber-700 bg-amber-100',
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? (score / max) * 100 : 0
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-16 text-right">{score.toFixed(1)} / {max}</span>
    </div>
  )
}

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
    // Timeout after 3 minutes
    if (Date.now() - startTime.current > 180_000) {
      setError('Scoring is taking longer than expected. Please contact your teacher.')
      setPolling(false)
      return
    }
    try {
      const r = await apiClient.get(`/scoring/attempt/${attemptId}/result`)
      setResult(r.data)
      setPolling(false)
    } catch (err: any) {
      if (err?.response?.status === 404) {
        // No result yet — trigger scoring if not already started
        triggerScoring()
      } else if (err?.response?.status === 400) {
        triggerScoring()
      } else {
        setError('Failed to load results. Please try again.')
        setPolling(false)
      }
    }
  }

  useEffect(() => {
    if (!attemptId) return
    fetchResult()
    pollRef.current = setInterval(fetchResult, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [attemptId])

  useEffect(() => {
    if (!polling && pollRef.current) clearInterval(pollRef.current)
  }, [polling])

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
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (!result) return null

  const scorePercent = result.overall_score_max > 0
    ? Math.round((result.overall_score / result.overall_score_max) * 100)
    : 0
  const cefrClass = CEFR_COLORS[result.cefr_level] || 'text-gray-600 bg-gray-100'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Assessment Results</h1>
          <button onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1 rounded-lg">
            Back to Home
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Overall result card */}
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
            {result.band_score != null && (
              <p className="text-sm text-gray-600 mb-3">Band score: <strong>{result.band_score.toFixed(1)}</strong> / 9</p>
            )}
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${scorePercent}%` }} />
            </div>
            {result.is_finalized && (
              <p className="text-xs text-green-700 mt-2 font-medium">Reviewed and finalised by teacher</p>
            )}
            {!result.is_finalized && (
              <p className="text-xs text-amber-600 mt-2">Pending teacher review</p>
            )}
            {result.teacher_notes && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">Teacher notes: </span>{result.teacher_notes}
              </div>
            )}
          </div>
        </div>

        {/* Per-task breakdown */}
        <h2 className="text-base font-semibold text-gray-700">Task Breakdown</h2>
        {result.task_results.map((task) => {
          const taskPct = task.max_score > 0 ? Math.round((task.score / task.max_score) * 100) : 0
          const taskCefrClass = CEFR_COLORS[task.cefr_level] || 'text-gray-600 bg-gray-100'
          return (
            <div key={task.task_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Task header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {TASK_TYPE_LABELS[task.task_type] || task.task_title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">{task.task_title}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-sm font-semibold ${taskCefrClass}`}>
                    {task.cefr_level}
                  </span>
                  <span className="text-sm text-gray-600">{taskPct}%</span>
                </div>
              </div>

              {/* Overall feedback */}
              {task.overall_feedback && (
                <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800">
                  {task.overall_feedback}
                </div>
              )}

              {/* Transcript (speaking) */}
              {task.transcript && (
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-1">Transcript</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.transcript}</p>
                </div>
              )}

              {/* Criteria */}
              <div className="px-5 py-4 space-y-3">
                {task.criteria.map((c) => (
                  <div key={c.detail_id}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{c.criterion_name}</span>
                      <div className="flex items-center gap-2">
                        {c.is_teacher_reviewed && (
                          <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Teacher</span>
                        )}
                        <span className="text-sm text-gray-600">
                          {c.effective_score.toFixed(1)} / {c.max_score}
                        </span>
                      </div>
                    </div>
                    <ScoreBar score={c.effective_score} max={c.max_score} />
                    {(c.teacher_feedback || c.feedback) && (
                      <p className="text-xs text-gray-500 mt-1">
                        {c.is_teacher_reviewed && c.teacher_feedback ? c.teacher_feedback : c.feedback}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </main>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

interface Scenario {
  id: string
  title: string
  description: string | null
  status: string
  tasks: { id: string; title: string; task_type: string }[]
}

interface Attempt {
  id: string
  student_id: string
  scenario_id: string
  status: string
}

interface ScoreResult {
  attempt_id: string
  cefr_level: string
  overall_score: number
  overall_score_max: number
  task_results: { task_type: string; score: number; max_score: number; cefr_level: string; overall_feedback: string }[]
}

export default function TeacherDashboard({ userName }: { userName: string }) {
  const navigate = useNavigate()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [scoring, setScoring] = useState<Record<string, 'idle' | 'loading' | 'done'>>({})
  const [scoreResults, setScoreResults] = useState<Record<string, ScoreResult>>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/teacher/scenarios').then(r => {
      setScenarios(r.data)
    }).catch(console.error).finally(() => setIsLoading(false))
  }, [])

  const loadAttempts = async (scenarioId: string) => {
    setSelectedScenario(scenarioId)
    try {
      const r = await apiClient.get('/attempts', { params: { status: 'submitted' } })
      const all: Attempt[] = r.data.items || []
      setAttempts(all.filter(a => a.scenario_id === scenarioId))
    } catch (e) {
      console.error(e)
    }
  }

  const handleScore = async (attemptId: string) => {
    setScoring(prev => ({ ...prev, [attemptId]: 'loading' }))
    try {
      const r = await apiClient.post(`/scoring/attempt/${attemptId}`)
      setScoreResults(prev => ({ ...prev, [attemptId]: r.data }))
      setScoring(prev => ({ ...prev, [attemptId]: 'done' }))
      // Remove from pending list
      setAttempts(prev => prev.filter(a => a.id !== attemptId))
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Scoring failed')
      setScoring(prev => ({ ...prev, [attemptId]: 'idle' }))
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">LCCA — Teacher Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Welcome, {userName}</p>
          </div>
          <button onClick={handleLogout}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex gap-6">
        {/* Scenarios panel */}
        <div className="w-80 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">My Scenarios</h2>
          {isLoading ? (
            <div className="animate-pulse space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg" />)}
            </div>
          ) : scenarios.length === 0 ? (
            <p className="text-sm text-gray-400">No scenarios yet.</p>
          ) : (
            <div className="space-y-2">
              {scenarios.map(s => (
                <button key={s.id} onClick={() => loadAttempts(s.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors
                    ${selectedScenario === s.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 text-sm">{s.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full
                      ${s.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{s.tasks.length} tasks</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Attempts + scoring panel */}
        <div className="flex-1">
          {!selectedScenario ? (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <p>Select a scenario to view submitted attempts</p>
            </div>
          ) : attempts.length === 0 && Object.keys(scoreResults).length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <p>No submitted (unscored) attempts for this scenario.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Submitted Attempts — pending scoring
              </h2>

              {attempts.map(attempt => (
                <div key={attempt.id} className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Attempt {attempt.id.slice(0, 8)}…</p>
                      <p className="text-xs text-gray-500 mt-0.5">Status: {attempt.status}</p>
                    </div>
                    <button
                      onClick={() => handleScore(attempt.id)}
                      disabled={scoring[attempt.id] === 'loading'}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                        ${scoring[attempt.id] === 'loading'
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                      {scoring[attempt.id] === 'loading' ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Scoring…
                        </>
                      ) : 'Score with AI'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Completed scores */}
              {Object.entries(scoreResults).map(([attemptId, result]) => (
                <div key={attemptId} className="bg-green-50 border border-green-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-green-900">
                      Attempt {attemptId.slice(0, 8)}… — Scored ✓
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-green-700">{result.cefr_level}</span>
                      <span className="text-sm text-green-600">
                        {result.overall_score.toFixed(1)} / {result.overall_score_max.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {result.task_results.map((t, i) => (
                      <div key={i} className="bg-white rounded p-3 text-sm">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium capitalize">{t.task_type}</span>
                          <span className="text-green-700 font-medium">{t.cefr_level}</span>
                        </div>
                        <div className="text-xs text-gray-500">{t.score.toFixed(1)}/{t.max_score} pts</div>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{t.overall_feedback}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

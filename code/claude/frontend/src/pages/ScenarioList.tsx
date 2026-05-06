import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { scenarioApi, authApi, attemptApi } from '../api/client'
import TeacherDashboard from './TeacherDashboard'
import AdminDashboard from './AdminDashboard'
import type { Scenario } from '../types'

const statusConfig = {
  draft: {
    label: 'Draft',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
  },
  published: {
    label: 'Published',
    bg: 'bg-green-50',
    text: 'text-green-700',
  },
  archived: {
    label: 'Archived',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
  },
}

export default function ScenarioList() {
  const navigate = useNavigate()
  const location = useLocation()
  const justSubmitted = (location.state as any)?.submitted === true
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  // Maps scenario_id → attempt_id for submitted/scored exam attempts
  const [submittedAttempts, setSubmittedAttempts] = useState<Map<string, string>>(new Map())
  // Maps scenario_id → attempt_id for in-progress/created exam attempts
  const [inProgressAttempts, setInProgressAttempts] = useState<Map<string, string>>(new Map())
  // Maps scenario_id → list of practice attempt IDs (most recent first)
  const [practiceHistory, setPracticeHistory] = useState<Map<string, string[]>>(new Map())
  // Maps scenario_id → attempt_id for in-progress/created practice attempts
  const [inProgressPracticeAttempts, setInProgressPracticeAttempts] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!localStorage.getItem('access_token')) { navigate('/login'); return }

    authApi.me().then(r => {
      setUserRole(r.data.role)
      setUserName(r.data.full_name || r.data.email)
    }).catch((err: any) => {
      if (err?.response?.status === 401) navigate('/login')
    })

    loadScenarios()

    // Only exam (non-practice) submitted attempts block the "Start Assessment" button.
    // Practice attempts are collected into practiceHistory.
    const mergeAttempts = (items: { id: string; scenario_id: string; is_practice?: boolean }[]) => {
      setSubmittedAttempts(prev => {
        const next = new Map(prev)
        items.filter(a => !a.is_practice).forEach(a => next.set(a.scenario_id, a.id))
        return next
      })
      setPracticeHistory(prev => {
        const next = new Map(prev)
        items.filter(a => a.is_practice).forEach(a => {
          const existing = next.get(a.scenario_id) || []
          if (!existing.includes(a.id)) next.set(a.scenario_id, [...existing, a.id])
        })
        return next
      })
    }

    attemptApi.list({ status: 'submitted', per_page: 100 }).then(r => {
      mergeAttempts(r.data.items || [])
    }).catch(() => {})

    attemptApi.list({ status: 'scored', per_page: 100 }).then(r => {
      mergeAttempts(r.data.items || [])
    }).catch(() => {})

    // Exam in-progress → "Continue Assessment"; practice in-progress → "Resume Practice"
    const mergeInProgress = (items: { id: string; scenario_id: string; is_practice?: boolean }[]) => {
      setInProgressAttempts(prev => {
        const next = new Map(prev)
        items.filter(a => !a.is_practice).forEach(a => next.set(a.scenario_id, a.id))
        return next
      })
      setInProgressPracticeAttempts(prev => {
        const next = new Map(prev)
        items.filter(a => a.is_practice).forEach(a => next.set(a.scenario_id, a.id))
        return next
      })
    }

    attemptApi.list({ status: 'in_progress' }).then(r => {
      mergeInProgress(r.data.items || [])
    }).catch(() => {})

    attemptApi.list({ status: 'created' }).then(r => {
      mergeInProgress(r.data.items || [])
    }).catch(() => {})
  }, [])

  const loadScenarios = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await scenarioApi.list({ status: 'published' })
      setScenarios(response.data.items || response.data)
    } catch (err: any) {
      console.error('Failed to load scenarios:', err)
      setError(err.response?.data?.message || 'Failed to load scenarios. Please try again.')
      // Fallback to empty list
      setScenarios([])
    } finally {
      setIsLoading(false)
    }
  }

  const formatDuration = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    }
    return `${minutes}m`
  }

  if (userRole === 'admin') return <AdminDashboard userName={userName} />
  if (userRole === 'teacher') return <TeacherDashboard userName={userName} />

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">LCCA Assessment</h1>
              <p className="mt-1 text-sm text-gray-500">
                Online English Competency Assessment System
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/profile" className="flex items-center gap-2 hover:opacity-80">
                <span className="text-sm text-gray-500">{userName || 'Student'}</span>
                <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium text-sm">
                  {(userName || 'S')[0].toUpperCase()}
                </div>
              </Link>
              <button onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1 rounded-lg">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Available Assessments</h2>
          <p className="mt-1 text-sm text-gray-500">
            Select an assessment to begin your exam
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Submitted banner */}
        {justSubmitted && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-blue-800 text-sm font-medium">
              Your assessment has been submitted and is being scored by AI. Click "View Results" on the card below to see your score.
            </p>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{error}</p>
            <button
              onClick={loadScenarios}
              className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Scenario Cards */}
        {!isLoading && scenarios.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {scenarios.map((scenario) => {
              const status = statusConfig[scenario.status]

              return (
                <div
                  key={scenario.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden
                    hover:shadow-md transition-shadow"
                >
                  {/* Card Header */}
                  <div className="p-6 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold text-gray-900 flex-1">
                        {scenario.title}
                      </h3>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0
                          ${status.bg} ${status.text}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                      {scenario.description}
                    </p>
                    {scenario.tags && scenario.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {scenario.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="px-6 py-4 bg-gray-50">
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>{formatDuration(scenario.duration_minutes)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        <span>{scenario.total_tasks} tasks</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-3">
                    {submittedAttempts.has(scenario.id) ? (
                      <div className="flex flex-col gap-2">
                        <div className="w-full flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-sm
                          bg-green-50 text-green-700 border border-green-200">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Submitted
                        </div>
                        <Link
                          to={`/result/${submittedAttempts.get(scenario.id)}`}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium
                            bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          View Results
                        </Link>
                        <Link
                          to={`/exam/${scenario.id}?mode=practice`}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium
                            transition-colors text-sm ${inProgressPracticeAttempts.has(scenario.id)
                              ? 'bg-amber-500 text-white hover:bg-amber-600'
                              : 'bg-purple-600 text-white hover:bg-purple-700'}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d={inProgressPracticeAttempts.has(scenario.id)
                                ? "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.649z"
                                : "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"} />
                          </svg>
                          {inProgressPracticeAttempts.has(scenario.id) ? 'Resume Practice' : 'Practice'}
                        </Link>
                      </div>
                    ) : inProgressAttempts.has(scenario.id) ? (
                      <div className="flex flex-col gap-2">
                        <div className="w-full flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-sm
                          bg-amber-50 text-amber-700 border border-amber-200">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          In Progress
                        </div>
                        <Link
                          to={`/exam/${scenario.id}`}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium
                            bg-amber-500 text-white hover:bg-amber-600 transition-colors text-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.649z" />
                          </svg>
                          Continue Assessment
                        </Link>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <Link
                          to={`/exam/${scenario.id}`}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium
                            bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.649z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Start Assessment
                        </Link>
                        <Link
                          to={`/exam/${scenario.id}?mode=practice`}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium
                            transition-colors text-sm ${inProgressPracticeAttempts.has(scenario.id)
                              ? 'bg-amber-500 text-white hover:bg-amber-600'
                              : 'bg-purple-600 text-white hover:bg-purple-700'}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d={inProgressPracticeAttempts.has(scenario.id)
                                ? "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.649z"
                                : "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"} />
                          </svg>
                          {inProgressPracticeAttempts.has(scenario.id) ? 'Resume Practice' : 'Practice'}
                        </Link>
                      </div>
                    )}

                    {/* Practice History */}
                    {practiceHistory.has(scenario.id) && (() => {
                      const ids = practiceHistory.get(scenario.id)!
                      return (
                        <div className="border-t border-gray-100 pt-3">
                          <p className="text-xs font-medium text-purple-700 mb-2 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Practice History ({ids.length} session{ids.length > 1 ? 's' : ''})
                          </p>
                          <div className="flex flex-col gap-1">
                            {ids.map((id, idx) => (
                              <Link
                                key={id}
                                to={`/result/${id}`}
                                className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs
                                  bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                              >
                                <span>Practice #{ids.length - idx}</span>
                                <span className="flex items-center gap-1 text-purple-500">
                                  View Results
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && scenarios.length === 0 && !error && (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No assessments available</h3>
            <p className="mt-1 text-sm text-gray-500">Check back later for new assessments.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            © 2024 LCCA Assessment System. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
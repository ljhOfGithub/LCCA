import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { scenarioApi, authApi } from '../api/client'
import TeacherDashboard from './TeacherDashboard'
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
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    // Fetch user role first, redirect to login if not authenticated
    authApi.me().then(r => {
      setUserRole(r.data.role)
      setUserName(r.data.full_name || r.data.email)
    }).catch((err: any) => {
      // Only redirect to login for authentication errors, not other failures
      if (err?.response?.status === 401 || !localStorage.getItem('access_token')) {
        navigate('/login')
      }
    })
    loadScenarios()
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

  // Show teacher dashboard for teacher/admin roles
  if (userRole === 'teacher' || userRole === 'admin') {
    return <TeacherDashboard userName={userName} />
  }

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
              <span className="text-sm text-gray-500">{userName || 'Student'}</span>
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium text-sm">
                {(userName || 'S')[0].toUpperCase()}
              </div>
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
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
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
                  <div className="px-6 py-4 border-t border-gray-100">
                    <Link
                      to={`/exam/${scenario.id}`}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium
                        bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.649z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Start Assessment
                    </Link>
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
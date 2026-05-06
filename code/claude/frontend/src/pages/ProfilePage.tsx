import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, resultApi } from '../api/client'

interface UserInfo {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
  last_login: string | null
}

interface AttemptSummary {
  id: string
  scenario_title?: string
  overall_score: number
  max_score: number
  cefr_level: string
  completed_at: string | null
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [results, setResults] = useState<AttemptSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('access_token')) { navigate('/login'); return }

    Promise.all([
      authApi.me(),
      resultApi.listMyResults({ per_page: 50 }).catch(() => ({ data: [] })),
    ]).then(([userRes, resultsRes]) => {
      setUser(userRes.data)
      setResults(Array.isArray(resultsRes.data) ? resultsRes.data : [])
    }).catch((err: any) => {
      if (err?.response?.status === 401) navigate('/login')
    }).finally(() => setLoading(false))
  }, [])

  const completedCount = results.filter(r => r.overall_score != null).length
  const avgScore = (() => {
    const withScores = results.filter(r => r.overall_score != null && r.max_score > 0)
    if (withScores.length === 0) return null
    const total = withScores.reduce((s, r) => s + (r.overall_score / r.max_score) * 100, 0)
    return (total / withScores.length).toFixed(1)
  })()

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    navigate('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900">My Profile</h1>
          </div>
          <button onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1 rounded-lg">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* User info card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
              {user.full_name[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{user.full_name}</h2>
              <p className="text-sm text-gray-500">{user.email}</p>
              <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full capitalize">
                {user.role}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400">Account created</p>
              <p className="text-gray-700">{new Date(user.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Last login</p>
              <p className="text-gray-700">{user.last_login ? new Date(user.last_login).toLocaleString() : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Status</p>
              <p className={user.is_active ? 'text-green-700' : 'text-red-600'}>
                {user.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
        </div>

        {/* Stats card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Assessment Summary</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-gray-900">{results.length}</p>
              <p className="text-xs text-gray-500 mt-1">Total Attempts</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-green-700">{completedCount}</p>
              <p className="text-xs text-gray-500 mt-1">Completed</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-blue-700">{avgScore ?? '—'}{avgScore != null ? '%' : ''}</p>
              <p className="text-xs text-gray-500 mt-1">Average Score</p>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}

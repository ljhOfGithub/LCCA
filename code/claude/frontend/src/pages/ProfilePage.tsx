import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, resultApi } from '../api/client'
import apiClient from '../api/client'

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

  // Change password form state
  const [pwOpen, setPwOpen] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

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

  const handleChangePassword = async () => {
    setPwError('')
    if (!oldPw) { setPwError('Please enter your current password'); return }
    if (newPw.length < 6) { setPwError('New password must be at least 6 characters'); return }
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return }
    setPwSaving(true)
    try {
      await apiClient.post('/change-password', null, {
        params: { old_password: oldPw, new_password: newPw },
      })
      setPwSuccess(true)
      setOldPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => { setPwSuccess(false); setPwOpen(false) }, 2000)
    } catch (e: any) {
      setPwError(e?.response?.data?.detail || 'Failed to change password')
    } finally {
      setPwSaving(false)
    }
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

        {/* Change password card */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => { setPwOpen(v => !v); setPwError(''); setPwSuccess(false) }}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-sm font-semibold text-gray-700">Change Password</span>
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${pwOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {pwOpen && (
            <div className="border-t border-gray-100 px-6 py-5 space-y-4">
              {pwSuccess && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Password changed successfully.
                </div>
              )}
              {pwError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{pwError}</p>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
                <input
                  type="password"
                  value={oldPw}
                  onChange={e => setOldPw(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="At least 6 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Re-enter new password"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleChangePassword}
                  disabled={pwSaving}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {pwSaving ? 'Saving…' : 'Update Password'}
                </button>
                <button
                  onClick={() => { setPwOpen(false); setOldPw(''); setNewPw(''); setConfirmPw(''); setPwError('') }}
                  className="px-5 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}

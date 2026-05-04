import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { attemptApi } from '../api/client'
import type { Attempt } from '../types'

export default function WaitingScore() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<number>(0)

  useEffect(() => {
    if (!attemptId) return

    // Load attempt details
    loadAttempt()

    // Start polling for status
    const pollInterval = setInterval(checkScoreStatus, 5000)

    return () => clearInterval(pollInterval)
  }, [attemptId])

  const loadAttempt = async () => {
    try {
      const response = await attemptApi.get(attemptId!)
      setAttempt(response.data)
    } catch (error) {
      console.error('Failed to load attempt:', error)
    }
  }

  const checkScoreStatus = async () => {
    if (!attemptId) return

    setIsChecking(true)
    try {
      const response = await attemptApi.get(attemptId)
      const updatedAttempt = response.data

      setAttempt(updatedAttempt)

      // Check if scored
      if (updatedAttempt.status === 'scored') {
        // Redirect to result page
        navigate(`/results/${attemptId}`)
        return
      }

      // Update time remaining
      if (updatedAttempt.expires_at) {
        const expires = new Date(updatedAttempt.expires_at).getTime()
        const now = Date.now()
        setTimeRemaining(Math.max(0, Math.floor((expires - now) / 1000)))
      }
    } catch (error) {
      console.error('Failed to check status:', error)
    } finally {
      setIsChecking(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getTaskStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'in_progress':
        return 'In Progress'
      case 'not_started':
        return 'Not Started'
      default:
        return status
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg max-w-2xl w-full p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-blue-600 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Exam Submitted Successfully
          </h1>
          <p className="text-gray-500">
            Your responses are being processed and scored
          </p>
        </div>

        {/* Processing Steps */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-800">Responses Submitted</div>
              <div className="text-sm text-gray-500">All your answers have been saved</div>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              attempt?.status === 'submitted' ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <svg
                className={`w-5 h-5 ${attempt?.status === 'submitted' ? 'text-blue-600 animate-spin' : 'text-gray-400'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-800">AI Scoring in Progress</div>
              <div className="text-sm text-gray-500">
                {attempt?.status === 'scored' ? 'Completed' : 'Analyzing your responses...'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-500">Generating Report</div>
              <div className="text-sm text-gray-400">Preparing your results</div>
            </div>
          </div>
        </div>

        {/* Task Summary */}
        {attempt?.task_responses && (
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Your Responses</h3>
            <div className="grid grid-cols-4 gap-3">
              {attempt.task_responses.map((task, index) => (
                <div
                  key={task.id}
                  className={`p-3 rounded-lg text-center ${
                    task.status === 'completed' ? 'bg-green-50' : 'bg-gray-50'
                  }`}
                >
                  <div className={`text-lg font-bold ${
                    task.status === 'completed' ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {getTaskStatusText(task.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status Indicator */}
        <div className="bg-blue-50 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              isChecking ? 'bg-yellow-400 animate-pulse' : 'bg-blue-400'
            }`} />
            <span className="text-sm text-blue-700">
              {isChecking ? 'Checking status...' : 'Auto-refreshing every 5 seconds'}
            </span>
          </div>
          {timeRemaining > 0 && (
            <span className="text-sm text-blue-600">
              Expected in {formatTime(timeRemaining)}
            </span>
          )}
        </div>

        {/* Manual Refresh */}
        <div className="mt-6 text-center">
          <button
            onClick={checkScoreStatus}
            disabled={isChecking}
            className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {isChecking ? 'Checking...' : 'Check Now'}
          </button>
        </div>

        {/* Tips */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <h4 className="text-sm font-medium text-gray-700 mb-3">While you wait:</h4>
          <ul className="text-sm text-gray-500 space-y-2">
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Do not close this page
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Results will be available automatically
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              You can safely navigate away and return later
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
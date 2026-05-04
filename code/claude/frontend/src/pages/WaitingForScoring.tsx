import { useState, useEffect, useCallback } from 'react'

interface WaitingForScoringProps {
  attemptId: string
  onComplete: (result: any) => void
  onError: (error: string) => void
}

interface ScoringStatus {
  totalTasks: number
  completedTasks: number
  status: 'pending' | 'scoring' | 'completed' | 'failed'
  currentTaskIndex?: number
  estimatedWaitTime?: number // in seconds
}

export default function WaitingForScoring({
  attemptId,
  onComplete,
  onError,
}: WaitingForScoringProps) {
  const [status, setStatus] = useState<ScoringStatus>({
    totalTasks: 4,
    completedTasks: 0,
    status: 'pending',
  })
  const [isPolling, setIsPolling] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/attempts/${attemptId}/status`)
      if (!response.ok) {
        throw new Error('Failed to fetch status')
      }

      const data = await response.json()

      const newStatus: ScoringStatus = {
        totalTasks: data.total_tasks || 4,
        completedTasks: data.completed_tasks || 0,
        status: data.status === 'scored' ? 'completed' : 'scoring',
        currentTaskIndex: data.current_task_index,
        estimatedWaitTime: data.estimated_wait_time,
      }

      setStatus(newStatus)

      // If scoring is complete, fetch results
      if (newStatus.status === 'completed') {
        setIsPolling(false)
        // Fetch the actual result
        const resultResponse = await fetch(`/api/v1/attempts/${attemptId}/result`)
        if (resultResponse.ok) {
          const result = await resultResponse.json()
          onComplete(result)
        } else {
          onComplete(null)
        }
      }
    } catch (error) {
      console.error('Failed to fetch scoring status:', error)
      onError('Failed to fetch scoring status. Retrying...')
    }
  }, [attemptId, onComplete, onError])

  // Polling effect
  useEffect(() => {
    if (!isPolling) return

    // Initial fetch
    fetchStatus()

    // Poll every 5 seconds
    const interval = setInterval(fetchStatus, 5000)

    return () => clearInterval(interval)
  }, [isPolling, fetchStatus])

  const progress = status.totalTasks > 0
    ? (status.completedTasks / status.totalTasks) * 100
    : 0

  const taskLabels = ['Reading', 'Writing', 'Listening', 'Speaking']

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-8">
        {/* Animated Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-primary-100 animate-ping opacity-75" />
            <div className="relative w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-primary-600 animate-bounce"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">
          Processing Your Results
        </h1>
        <p className="text-gray-500 text-center mb-8">
          AI is evaluating your responses. This may take a few minutes.
        </p>

        {/* Progress Section */}
        <div className="mb-8">
          {/* Overall Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Overall Progress</span>
              <span className="font-semibold text-gray-800">
                {status.completedTasks} / {status.totalTasks} tasks
              </span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Individual Task Status */}
          <div className="space-y-3">
            {taskLabels.map((label, index) => {
              const isCompleted = index < status.completedTasks
              const isCurrent = index === status.completedTasks

              return (
                <div
                  key={label}
                  className={`flex items-center gap-4 p-3 rounded-lg transition-all
                    ${isCompleted ? 'bg-success-50' : isCurrent ? 'bg-primary-50' : 'bg-gray-50'}
                  `}
                >
                  {/* Status Icon */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center
                      ${isCompleted
                        ? 'bg-success-500 text-white'
                        : isCurrent
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-300 text-gray-500'
                      }
                    `}
                  >
                    {isCompleted ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isCurrent ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <span className="text-sm font-medium">{index + 1}</span>
                    )}
                  </div>

                  {/* Task Name */}
                  <span
                    className={`flex-1 font-medium
                      ${isCompleted ? 'text-success-700' : isCurrent ? 'text-primary-700' : 'text-gray-500'}
                    `}
                  >
                    {label}
                  </span>

                  {/* Status Text */}
                  <span
                    className={`text-sm
                      ${isCompleted ? 'text-success-600' : isCurrent ? 'text-primary-600' : 'text-gray-400'}
                    `}
                  >
                    {isCompleted ? 'Completed' : isCurrent ? 'In Progress...' : 'Waiting'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Estimated Time */}
        {status.estimatedWaitTime && (
          <div className="text-center text-sm text-gray-500 mb-6">
            Estimated time remaining: ~{Math.ceil(status.estimatedWaitTime / 60)} minutes
          </div>
        )}

        {/* Info Box */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-gray-600">
              <p className="font-medium mb-1">What happens next?</p>
              <p>AI scoring uses multiple factors including:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Accuracy and completeness of responses</li>
                <li>Language proficiency and vocabulary</li>
                <li>Coherence and organization</li>
                <li>Task completion quality</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Don't refresh warning */}
        <div className="mt-6 text-center">
          <p className="text-sm text-warning-600 font-medium flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Please don't close or refresh this page
          </p>
        </div>
      </div>
    </div>
  )
}
import { TaskStatus, TaskType } from '../types'

interface SubmissionConfirmationProps {
  tasks: Array<{
    id: string
    title: string
    type: TaskType
    status: TaskStatus
  }>
  onConfirm: () => Promise<void>
  onCancel: () => void
  isSubmitting?: boolean
}

export default function SubmissionConfirmation({
  tasks,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: SubmissionConfirmationProps) {
  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const allCompleted = completedCount === tasks.length

  const taskTypeLabels: Record<TaskType, string> = {
    reading: 'Reading & Notes',
    writing: 'Writing',
    listening: 'Listening & Notes',
    speaking: 'Speaking',
  }

  const statusIcons = {
    not_started: (
      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    in_progress: (
      <svg className="w-5 h-5 text-warning-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    ),
    completed: (
      <svg className="w-5 h-5 text-success-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-8">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">
          Submit Your Exam
        </h1>
        <p className="text-gray-500 text-center mb-8">
          Please review your progress before submitting
        </p>

        {/* Task Status List */}
        <div className="space-y-3 mb-8">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg"
            >
              {/* Task Number */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                  ${task.status === 'completed' ? 'bg-success-500 text-white' : 'bg-gray-300 text-gray-600'}
                `}
              >
                {index + 1}
              </div>

              {/* Task Info */}
              <div className="flex-1">
                <div className="font-medium text-gray-800">
                  {taskTypeLabels[task.type] || task.title}
                </div>
                <div className="text-sm text-gray-500">
                  {task.status === 'completed' && 'Completed'}
                  {task.status === 'in_progress' && 'In Progress'}
                  {task.status === 'not_started' && 'Not Started'}
                </div>
              </div>

              {/* Status Icon */}
              {statusIcons[task.status]}
            </div>
          ))}
        </div>

        {/* Warning if not all completed */}
        {!allCompleted && (
          <div className="mb-6 p-4 bg-warning-50 border border-warning-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-warning-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-medium text-warning-800">Incomplete Tasks</p>
                <p className="text-sm text-warning-700 mt-1">
                  You have {tasks.length - completedCount} incomplete task(s).
                  Unanswered tasks may affect your final score.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Final Warning */}
        <div className="mb-6 p-4 bg-danger-50 border border-danger-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-danger-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-danger-800">This action cannot be undone</p>
              <p className="text-sm text-danger-700 mt-1">
                Once submitted, you cannot modify your responses.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium
              hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Go Back
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
              ${allCompleted
                ? 'bg-success-600 text-white hover:bg-success-700'
                : 'bg-warning-600 text-white hover:bg-warning-700'
              }
              disabled:opacity-50
            `}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting...
              </>
            ) : (
              'Submit Exam'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
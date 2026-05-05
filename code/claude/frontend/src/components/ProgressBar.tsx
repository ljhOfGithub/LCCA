import { TaskStatus } from '../types'

interface ProgressBarProps {
  tasks: Array<{
    id: string
    title: string
    status: TaskStatus
    type: string
  }>
  currentTaskId?: string
  onTaskClick?: (taskId: string, status: TaskStatus) => void
}

const statusStyles = {
  not_started: {
    bg: 'bg-gray-200',
    border: 'border-gray-300',
    text: 'text-gray-500',
    icon: '○',
  },
  in_progress: {
    bg: 'bg-primary-100',
    border: 'border-primary-500',
    text: 'text-primary-700',
    icon: '◐',
  },
  completed: {
    bg: 'bg-success-50',
    border: 'border-success-500',
    text: 'text-success-700',
    icon: '●',
  },
} as const

const taskTypeLabels: Record<string, string> = {
  reading: 'Task 1: Reading & Notes',
  writing: 'Task 2: Writing',
  listening: 'Task 3: Listening',
  speaking: 'Task 4: Speaking',
}

export default function ProgressBar({
  tasks,
  currentTaskId,
  onTaskClick,
}: ProgressBarProps) {
  return (
    <div className="w-full bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Progress</h3>

      <div className="space-y-3">
        {tasks.map((task, index) => {
          const styles = statusStyles[task.status]
          const isCurrent = task.id === currentTaskId

          return (
            <div
              key={task.id}
              className={`relative ${isCurrent ? 'ring-2 ring-primary-500 ring-offset-2 rounded-lg' : ''}`}
            >
              <button
                onClick={() => onTaskClick?.(task.id, task.status)}
                className={`w-full text-left p-3 rounded-lg border-2 transition-all hover:shadow-md cursor-pointer
                  ${styles.border} ${styles.bg}
                  ${isCurrent ? 'ring-2 ring-primary-500' : ''}
                `}
              >
                <div className="flex items-center gap-3">
                  {/* Status Icon */}
                  <span className={`text-lg ${styles.text}`}>
                    {styles.icon}
                  </span>

                  {/* Task Info */}
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${styles.text}`}>
                      {taskTypeLabels[task.type] || task.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {task.status === 'completed' && 'Completed'}
                      {task.status === 'in_progress' && 'In Progress'}
                      {task.status === 'not_started' && 'Not Started'}
                    </div>
                  </div>

                  {/* Sequence Number */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                    ${isCurrent ? 'bg-primary-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                    {index + 1}
                  </div>
                </div>
              </button>
            </div>
          )
        })}
      </div>

      {/* Progress Summary */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Completed</span>
          <span className="font-semibold">
            {tasks.filter((t) => t.status === 'completed').length} / {tasks.length}
          </span>
        </div>
        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-success-500 transition-all duration-300"
            style={{
              width: `${(tasks.filter((t) => t.status === 'completed').length / tasks.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}
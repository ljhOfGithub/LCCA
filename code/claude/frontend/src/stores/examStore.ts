import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Attempt, TaskResponseInfo, TaskStatus } from '../types'

// Task 3 state
interface ListeningState {
  audioUrl: string
  notes: string
  audioReplayCount: number
  startedAt: string | null
}

// Task 4 state
interface SpeakingState {
  recordings: Record<string, string> // questionId -> storageKey
  currentQuestionIndex: number
  startedAt: string | null
}

// Exam store interface
interface ExamStore {
  // Current exam session
  currentAttempt: Attempt | null
  currentTaskIndex: number

  // Task 3 listening state
  listeningState: ListeningState | null
  setListeningState: (state: Partial<ListeningState>) => void

  // Task 4 speaking state
  speakingState: SpeakingState | null
  setSpeakingState: (state: Partial<SpeakingState>) => void

  // Actions
  startAttempt: (attempt: Attempt) => void
  updateTaskResponse: (taskId: string, response: Partial<TaskResponseInfo>) => void
  completeTask: (taskId: string) => void
  goToTask: (index: number) => void
  resetExam: () => void

  // Auto-save helpers
  saveListeningNotes: (notes: string) => void
  addRecording: (questionId: string, storageKey: string) => void
}

const initialListeningState: ListeningState = {
  audioUrl: '',
  notes: '',
  audioReplayCount: 0,
  startedAt: null,
}

const initialSpeakingState: SpeakingState = {
  recordings: {},
  currentQuestionIndex: 0,
  startedAt: null,
}

export const useExamStore = create<ExamStore>()(
  persist(
    (set) => ({
      // Initial state
      currentAttempt: null,
      currentTaskIndex: 0,
      listeningState: null,
      speakingState: null,

      // Listening state management
      setListeningState: (state) => set((s) => ({
        listeningState: {
          ...s.listeningState,
          ...initialListeningState,
          ...state,
        } as ListeningState,
      })),

      // Speaking state management
      setSpeakingState: (state) => set((s) => ({
        speakingState: {
          ...s.speakingState,
          ...initialSpeakingState,
          ...state,
        } as SpeakingState,
      })),

      // Start a new exam attempt
      startAttempt: (attempt) => set({
        currentAttempt: attempt,
        currentTaskIndex: 0,
        listeningState: null,
        speakingState: null,
      }),

      // Update a task response
      updateTaskResponse: (taskId, response) => set((s) => {
        if (!s.currentAttempt) return s

        const taskResponses = [...(s.currentAttempt.task_responses || [])]
        const existingIndex = taskResponses.findIndex((tr) => tr.task_id === taskId)

        if (existingIndex >= 0) {
          taskResponses[existingIndex] = {
            ...taskResponses[existingIndex],
            ...response,
          }
        } else {
          taskResponses.push({
            id: `temp-${taskId}`,
            task_id: taskId,
            status: 'in_progress' as TaskStatus,
            ...response,
          })
        }

        return {
          currentAttempt: {
            ...s.currentAttempt,
            task_responses: taskResponses,
          },
        }
      }),

      // Mark a task as complete
      completeTask: (taskId) => set((s) => {
        if (!s.currentAttempt) return s

        const taskResponses = s.currentAttempt.task_responses.map((tr) =>
          tr.task_id === taskId
            ? { ...tr, status: 'completed' as TaskStatus, submitted_at: new Date().toISOString() }
            : tr
        )

        return {
          currentAttempt: {
            ...s.currentAttempt,
            task_responses: taskResponses,
          },
          currentTaskIndex: s.currentTaskIndex + 1,
        }
      }),

      // Navigate to specific task
      goToTask: (index) => set({ currentTaskIndex: index }),

      // Reset exam state
      resetExam: () => set({
        currentAttempt: null,
        currentTaskIndex: 0,
        listeningState: null,
        speakingState: null,
      }),

      // Helper: save listening notes
      saveListeningNotes: (notes) => set((s) => ({
        listeningState: s.listeningState
          ? { ...s.listeningState, notes }
          : { ...initialListeningState, notes },
      })),

      // Helper: add a recording
      addRecording: (questionId, storageKey) => set((s) => ({
        speakingState: s.speakingState
          ? {
              ...s.speakingState,
              recordings: { ...s.speakingState.recordings, [questionId]: storageKey },
            }
          : { ...initialSpeakingState, recordings: { [questionId]: storageKey } },
      })),
    }),
    {
      name: 'lcca-exam-storage',
      partialize: (state) => ({
        currentAttempt: state.currentAttempt,
        currentTaskIndex: state.currentTaskIndex,
        listeningState: state.listeningState,
        speakingState: state.speakingState,
      }),
    }
  )
)

// Selector helpers
export const selectCurrentAttempt = (state: ExamStore) => state.currentAttempt
export const selectCurrentTask = (state: ExamStore) => state.currentTaskIndex
export const selectListeningState = (state: ExamStore) => state.listeningState
export const selectSpeakingState = (state: ExamStore) => state.speakingState

export const selectTaskResponse = (taskId: string) => (state: ExamStore) =>
  state.currentAttempt?.task_responses.find((tr) => tr.task_id === taskId)
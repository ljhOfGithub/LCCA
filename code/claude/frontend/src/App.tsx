import { Routes, Route, Navigate } from 'react-router-dom'
import ScenarioList from './pages/ScenarioList'
import ScenarioRunner from './pages/ScenarioRunner'
import SubmissionConfirmation from './pages/SubmissionConfirmation'
import WaitingForScoring from './pages/WaitingForScoring'
import ResultReport from './pages/ResultReport'
import ResultPage from './pages/ResultPage'
import LoginPage from './pages/LoginPage'
import type { ExamResult } from './types'

// Wrapper component for SubmissionConfirmation with params
function SubmissionConfirmationPage() {
  return <SubmissionConfirmation
    tasks={[]}
    onConfirm={async () => {}}
    onCancel={() => {}}
  />
}

// Wrapper component for WaitingForScoring
function WaitingForScoringPage() {
  return <WaitingForScoring
    attemptId=""
    onComplete={(result) => console.log(result)}
    onError={(error) => console.error(error)}
  />
}

// Wrapper component for ResultReport
function ResultReportPage() {
  const mockResult: ExamResult = {
    id: 'mock',
    attempt_id: 'mock',
    cefr_level: 'B2',
    overall_score: 75,
    competence_scores: [
      { competence: 'reading', score: 80, max_score: 100, cefr_level: 'B2' },
      { competence: 'writing', score: 70, max_score: 100, cefr_level: 'B1' },
      { competence: 'listening', score: 75, max_score: 100, cefr_level: 'B2' },
      { competence: 'speaking', score: 72, max_score: 100, cefr_level: 'B1' },
    ],
    detailed_feedback: {
      reading: 'Strong comprehension skills with good vocabulary usage.',
      writing: 'Clear structure but could improve paragraph transitions.',
      listening: 'Good understanding of main ideas, some difficulty with details.',
      speaking: 'Fluent communication, occasional grammatical errors.',
    },
    generated_at: new Date().toISOString(),
  }
  return <ResultReport result={mockResult} />
}

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ScenarioList />} />
        <Route path="/exam/:scenarioId" element={<ScenarioRunner />} />
        <Route path="/exam/:scenarioId/submit" element={<SubmissionConfirmationPage />} />
        <Route path="/exam/:scenarioId/waiting" element={<WaitingForScoringPage />} />
        <Route path="/exam/:scenarioId/result" element={<ResultReportPage />} />
        <Route path="/result/:attemptId" element={<ResultPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
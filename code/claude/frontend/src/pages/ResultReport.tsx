import { useMemo } from 'react'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
} from 'recharts'
import type { ExamResult } from '../types'

interface ResultReportProps {
  result: ExamResult
  onDownloadPDF?: () => void
  onRetakeExam?: () => void
}

const cefrColors: Record<string, string> = {
  A1: '#10b981', // emerald
  A2: '#22c55e', // green
  B1: '#3b82f6', // blue
  B2: '#8b5cf6', // violet
  C1: '#f59e0b', // amber
  C2: '#ef4444', // red
}

const cefrDescriptions: Record<string, string> = {
  A1: 'Beginner - Can understand and use familiar everyday expressions',
  A2: 'Elementary - Can communicate in simple and routine tasks',
  B1: 'Intermediate - Can deal with most travel situations',
  B2: 'Upper Intermediate - Can interact with native speakers fluently',
  C1: 'Advanced - Can express ideas fluently and spontaneously',
  C2: 'Proficient - Can understand with ease practically everything',
}

export default function ResultReport({
  result,
  onDownloadPDF,
  onRetakeExam,
}: ResultReportProps) {
  // Prepare radar chart data
  const radarData = useMemo(() => {
    return result.competence_scores.map((cs) => ({
      subject: cs.competence.charAt(0).toUpperCase() + cs.competence.slice(1),
      score: (cs.score / cs.max_score) * 100,
      fullMark: 100,
    }))
  }, [result.competence_scores])

  // Prepare bar chart data
  const barData = useMemo(() => {
    return result.competence_scores.map((cs) => ({
      name: cs.competence.charAt(0).toUpperCase() + cs.competence.slice(1),
      score: cs.score,
      max: cs.max_score,
      percentage: Math.round((cs.score / cs.max_score) * 100),
      cefr: cs.cefr_level,
    }))
  }, [result.competence_scores])

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Card */}
        <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-8 text-white text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-white opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">Exam Completed</h1>
          <div className="inline-block bg-white/20 rounded-xl px-8 py-4 mt-4">
            <div className="text-sm text-white/80 mb-1">CEFR Level</div>
            <div
              className="text-6xl font-bold"
              style={{ color: cefrColors[result.cefr_level] || '#ffffff' }}
            >
              {result.cefr_level}
            </div>
          </div>
          <p className="mt-4 text-white/80 max-w-md mx-auto">
            {cefrDescriptions[result.cefr_level] || 'Your proficiency level has been assessed.'}
          </p>
        </div>

        {/* Competence Matrix Card */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Competence Matrix</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Radar Chart */}
            <div className="h-64">
              <h3 className="text-sm font-medium text-gray-500 mb-4 text-center">Radar Chart</h3>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                  />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.4}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Bar Chart with CEFR Colors */}
            <div className="h-64">
              <h3 className="text-sm font-medium text-gray-500 mb-4 text-center">Score Breakdown</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    width={80}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}%`, 'Percentage']}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                    }}
                  />
                  <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                    {barData.map((entry, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={cefrColors[entry.cefr] || '#3b82f6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Score Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {barData.map((item) => (
              <div
                key={item.name}
                className="bg-gray-50 rounded-lg p-4 text-center"
              >
                <div className="text-sm text-gray-500 mb-1">{item.name}</div>
                <div
                  className="text-2xl font-bold mb-1"
                  style={{ color: cefrColors[item.cefr] || '#374151' }}
                >
                  {item.percentage}%
                </div>
                <div
                  className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: cefrColors[item.cefr] || '#6b7280' }}
                >
                  {item.cefr}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Feedback Card */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Detailed Feedback</h2>

          <div className="space-y-6">
            {/* Reading Feedback */}
            <div className="border-l-4 border-blue-500 pl-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Reading</h3>
                  <span className="text-sm text-gray-500">Reading comprehension ability</span>
                </div>
              </div>
              <p className="text-gray-600 leading-relaxed pl-13">
                {result.detailed_feedback.reading}
              </p>
            </div>

            {/* Writing Feedback */}
            <div className="border-l-4 border-green-500 pl-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Writing</h3>
                  <span className="text-sm text-gray-500">Written expression skills</span>
                </div>
              </div>
              <p className="text-gray-600 leading-relaxed">
                {result.detailed_feedback.writing}
              </p>
            </div>

            {/* Listening Feedback */}
            <div className="border-l-4 border-purple-500 pl-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Listening</h3>
                  <span className="text-sm text-gray-500">Audio comprehension skills</span>
                </div>
              </div>
              <p className="text-gray-600 leading-relaxed">
                {result.detailed_feedback.listening}
              </p>
            </div>

            {/* Speaking Feedback */}
            <div className="border-l-4 border-orange-500 pl-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Speaking</h3>
                  <span className="text-sm text-gray-500">Oral communication ability</span>
                </div>
              </div>
              <p className="text-gray-600 leading-relaxed">
                {result.detailed_feedback.speaking}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {onDownloadPDF && (
            <button
              onClick={onDownloadPDF}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium
                hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download PDF Report
            </button>
          )}

          {onRetakeExam && (
            <button
              onClick={onRetakeExam}
              className="px-6 py-3 bg-white border-2 border-primary-600 text-primary-600 rounded-lg font-medium
                hover:bg-primary-50 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retake Exam
            </button>
          )}
        </div>

        {/* Footer Info */}
        <div className="text-center text-sm text-gray-500">
          <p>Generated on {new Date(result.generated_at).toLocaleString()}</p>
          <p className="mt-1">Result ID: {result.id}</p>
        </div>
      </div>
    </div>
  )
}
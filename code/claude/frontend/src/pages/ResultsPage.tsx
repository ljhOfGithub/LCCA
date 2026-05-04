import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { Download, RefreshCw, Award, Target, MessageSquare, Headphones, Mic, BookOpen } from 'lucide-react'
import type { ExamResult, CompetenceScore } from '../types'

interface ResultsPageProps {
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
  A1: 'Beginner - Can understand and use familiar everyday expressions and very basic phrases.',
  A2: 'Elementary - Can communicate in simple and routine tasks requiring direct exchange of information.',
  B1: 'Intermediate - Can deal with most travel situations and describe experiences and events.',
  B2: 'Upper Intermediate - Can interact with native speakers with sufficient fluency and spontaneity.',
  C1: 'Advanced - Can express ideas fluently and spontaneously without much obvious searching for expressions.',
  C2: 'Proficient - Can understand with ease practically everything heard or read.',
}

const competenceIcons: Record<string, JSX.Element> = {
  reading: <BookOpen className="w-5 h-5" />,
  writing: <Target className="w-5 h-5" />,
  listening: <Headphones className="w-5 h-5" />,
  speaking: <Mic className="w-5 h-5" />,
}

export default function ResultsPage({ result, onDownloadPDF, onRetakeExam }: ResultsPageProps) {
  const navigate = useNavigate()
  const [isDownloading, setIsDownloading] = useState(false)

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

  const handleDownloadPDF = async () => {
    setIsDownloading(true)
    try {
      if (onDownloadPDF) {
        await onDownloadPDF()
      } else {
        // Default behavior: trigger browser print dialog
        window.print()
      }
    } finally {
      setIsDownloading(false)
    }
  }

  const handleRetake = () => {
    if (onRetakeExam) {
      onRetakeExam()
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* CEFR Level Hero Card */}
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-3xl p-8 text-white text-center relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
          <div className="absolute -bottom-20 -left-10 w-60 h-60 bg-white/5 rounded-full" />

          <div className="relative z-10">
            <div className="mb-4">
              <Award className="w-16 h-16 mx-auto text-white/80" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Assessment Complete</h1>
            <div className="inline-block bg-white/20 backdrop-blur rounded-2xl px-12 py-6 mt-4">
              <div className="text-sm text-white/80 mb-2 uppercase tracking-wide">Your CEFR Level</div>
              <div
                className="text-7xl font-bold"
                style={{ color: cefrColors[result.cefr_level] || '#ffffff' }}
              >
                {result.cefr_level}
              </div>
            </div>
            <p className="mt-6 text-white/90 max-w-lg mx-auto text-sm leading-relaxed">
              {cefrDescriptions[result.cefr_level]}
            </p>
          </div>
        </div>

        {/* Competence Matrix Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Target className="w-6 h-6 text-primary-600" />
            Competence Matrix
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Radar Chart */}
            <div className="h-64">
              <h3 className="text-sm font-medium text-gray-500 mb-4 text-center">Skill Distribution</h3>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%">
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
                className="bg-gray-50 rounded-xl p-4 text-center hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-center mb-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center
                    ${item.name === 'Reading' ? 'bg-blue-100 text-blue-600' :
                      item.name === 'Writing' ? 'bg-green-100 text-green-600' :
                      item.name === 'Listening' ? 'bg-purple-100 text-purple-600' :
                      'bg-orange-100 text-orange-600'}`}>
                    {competenceIcons[item.name.toLowerCase()]}
                  </div>
                </div>
                <div className="text-sm text-gray-500 mb-1">{item.name}</div>
                <div
                  className="text-2xl font-bold mb-1"
                  style={{ color: cefrColors[item.cefr] || '#374151' }}
                >
                  {item.percentage}%
                </div>
                <div
                  className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white"
                  style={{ backgroundColor: cefrColors[item.cefr] || '#6b7280' }}
                >
                  {item.cefr}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Feedback Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary-600" />
            Detailed Feedback
          </h2>

          <div className="space-y-6">
            {/* Reading Feedback */}
            <FeedbackItem
              competence="reading"
              feedback={result.detailed_feedback.reading}
              score={result.competence_scores.find(s => s.competence === 'reading')}
              color="blue"
            />

            {/* Writing Feedback */}
            <FeedbackItem
              competence="writing"
              feedback={result.detailed_feedback.writing}
              score={result.competence_scores.find(s => s.competence === 'writing')}
              color="green"
            />

            {/* Listening Feedback */}
            <FeedbackItem
              competence="listening"
              feedback={result.detailed_feedback.listening}
              score={result.competence_scores.find(s => s.competence === 'listening')}
              color="purple"
            />

            {/* Speaking Feedback */}
            <FeedbackItem
              competence="speaking"
              feedback={result.detailed_feedback.speaking}
              score={result.competence_scores.find(s => s.competence === 'speaking')}
              color="orange"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {onDownloadPDF && (
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="px-8 py-3 bg-primary-600 text-white rounded-xl font-medium
                hover:bg-primary-700 transition-colors flex items-center justify-center gap-2
                disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {isDownloading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              Download PDF Report
            </button>
          )}

          {onRetakeExam && (
            <button
              onClick={handleRetake}
              className="px-8 py-3 bg-white border-2 border-primary-600 text-primary-600 rounded-xl font-medium
                hover:bg-primary-50 transition-colors flex items-center justify-center gap-2 shadow-lg"
            >
              <RefreshCw className="w-5 h-5" />
              Retake Exam
            </button>
          )}
        </div>

        {/* Footer Info */}
        <div className="text-center text-sm text-gray-500 pb-8">
          <p>Generated on {new Date(result.generated_at).toLocaleString()}</p>
          <p className="mt-1">Result ID: {result.id}</p>
        </div>
      </div>
    </div>
  )
}

// Feedback item component
interface FeedbackItemProps {
  competence: string
  feedback: string
  score?: CompetenceScore
  color: 'blue' | 'green' | 'purple' | 'orange'
}

const colorMap = {
  blue: { border: 'border-l-blue-500', bg: 'bg-blue-100', text: 'text-blue-600', icon: <BookOpen className="w-5 h-5" /> },
  green: { border: 'border-l-green-500', bg: 'bg-green-100', text: 'text-green-600', icon: <Target className="w-5 h-5" /> },
  purple: { border: 'border-l-purple-500', bg: 'bg-purple-100', text: 'text-purple-600', icon: <Headphones className="w-5 h-5" /> },
  orange: { border: 'border-l-orange-500', bg: 'bg-orange-100', text: 'text-orange-600', icon: <Mic className="w-5 h-5" /> },
}

function FeedbackItem({ competence, feedback, score, color }: FeedbackItemProps) {
  const colors = colorMap[color]

  return (
    <div className={`border-l-4 ${colors.border} pl-4`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-full ${colors.bg} flex items-center justify-center ${colors.text}`}>
          {colors.icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-800 capitalize">{competence}</h3>
          {score && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                Score: {score.score}/{score.max_score}
              </span>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded text-white"
                style={{ backgroundColor: cefrColors[score.cefr_level] }}
              >
                {score.cefr_level}
              </span>
            </div>
          )}
        </div>
      </div>
      <p className="text-gray-600 leading-relaxed">{feedback}</p>
    </div>
  )
}
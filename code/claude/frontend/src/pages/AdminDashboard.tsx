import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Material {
  id: string
  material_type: string
  content: string | null
  storage_key: string | null
  metadata_json: string | null
}

interface Task {
  id: string
  title: string
  description: string | null
  task_type: string
  sequence_order: number
  time_limit_seconds: number | null
  weight: number
  materials: Material[]
}

interface Scenario {
  id: string
  title: string
  description: string | null
  status: string
  tasks: Task[]
}

interface CriterionOut {
  id: string
  name: string
  description: string | null
  domain: string | null
  competence: string | null
  max_score: number
  weight: number
  sequence_order: number
  cefr_descriptors: Record<string, string> | null
}

interface RubricOut {
  id: string
  task_id: string
  name: string
  criteria: CriterionOut[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TASK_TYPES = ['reading', 'writing', 'listening', 'speaking']
const MATERIAL_TYPES = ['advertisement', 'resume', 'job_description', 'notes', 'audio', 'other']
const FILE_MATERIAL_TYPES = ['resume', 'job_description']
const RUBRIC_CEFR_BANDS = ['A2', 'B1', 'B2', 'C1']
const DOMAINS = ['Social-interpersonal', 'Academic', 'Professional', 'Transactional', 'Intercultural']
const COMPETENCES = ['Linguistic', 'Discourse', 'Sociolinguistic', 'Strategic', 'Pragmatic']

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-amber-100 text-amber-600',
}

function Badge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

type Tab = 'scenarios' | 'rubrics' | 'prompts'

const TAB_LABELS: Record<Tab, string> = {
  scenarios: 'Scenarios & Tasks',
  rubrics: 'Rubric Matrix',
  prompts: 'Prompt Templates',
}

export default function AdminDashboard({ userName }: { userName: string }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('scenarios')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-gray-900">LCCA — Admin</span>
          <nav className="flex gap-1">
            {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${tab === t ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs font-medium">Admin</span>
          <span>{userName}</span>
          <button onClick={() => { localStorage.removeItem('access_token'); navigate('/login') }}
            className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">Logout</button>
        </div>
      </header>
      <main className="flex-1 p-6">
        {tab === 'scenarios' && <ScenariosTab />}
        {tab === 'rubrics' && <RubricMatrixTab />}
        {tab === 'prompts' && <PromptTemplatesTab />}
      </main>
    </div>
  )
}

// ── Scenarios tab (identical to old TeacherDashboard ScenariosTab) ─────────────

function ScenariosTab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Scenario | null>(null)
  const [creating, setCreating] = useState(false)

  const reload = () => {
    setLoading(true)
    apiClient.get('/teacher/scenarios').then(r => setScenarios(r.data))
      .catch(console.error).finally(() => setLoading(false))
  }
  useEffect(() => { reload() }, [])

  const select = (s: Scenario) =>
    apiClient.get(`/teacher/scenarios/${s.id}`).then(r => setSelected(r.data))

  if (creating) return <ScenarioForm onSave={() => { setCreating(false); reload() }} onCancel={() => setCreating(false)} />
  if (selected) return (
    <ScenarioDetail scenario={selected} onBack={() => { setSelected(null); reload() }}
      onReload={() => apiClient.get(`/teacher/scenarios/${selected.id}`).then(r => setSelected(r.data))} />
  )

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Scenarios</h2>
        <button onClick={() => setCreating(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + New Scenario
        </button>
      </div>
      {loading ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />)}</div>
        : scenarios.length === 0 ? <div className="text-center py-16 text-gray-400">No scenarios yet.</div>
        : (
          <div className="space-y-3">
            {scenarios.map(s => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:border-blue-300 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{s.title}</span>
                    <Badge status={s.status} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{s.tasks.length} tasks{s.description ? ` · ${s.description.slice(0, 60)}` : ''}</p>
                </div>
                <button onClick={() => select(s)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Manage →</button>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

function ScenarioForm({ initial, onSave, onCancel }: { initial?: Scenario; onSave: (s: Scenario) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'draft')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      const r = initial
        ? await apiClient.put(`/teacher/scenarios/${initial.id}`, { title, description, status })
        : await apiClient.post('/teacher/scenarios', { title, description, status })
      onSave(r.data)
    } catch (e: any) { setError(e.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{initial ? 'Edit Scenario' : 'New Scenario'}</h3>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
      <input value={title} onChange={e => setTitle(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {initial && (
        <>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </>
      )}
      <div className="flex gap-3 mt-4">
        <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={onCancel} className="px-5 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  )
}

function ScenarioDetail({ scenario, onBack, onReload }: { scenario: Scenario; onBack: () => void; onReload: () => void }) {
  const [editingScenario, setEditingScenario] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [addingTask, setAddingTask] = useState(false)
  const [editingWeights, setEditingWeights] = useState(false)
  const [weights, setWeights] = useState<Record<string, string>>({})

  const startEditWeights = () => {
    const init: Record<string, string> = {}
    scenario.tasks.forEach(t => { init[t.id] = String(t.weight ?? 1) })
    setWeights(init)
    setEditingWeights(true)
  }

  const saveWeights = async () => {
    await Promise.all(
      scenario.tasks.map(t =>
        apiClient.put(`/teacher/tasks/${t.id}`, { weight: parseFloat(weights[t.id]) || 1 })
      )
    )
    setEditingWeights(false)
    onReload()
  }

  if (editingScenario) return <ScenarioForm initial={scenario} onSave={() => { setEditingScenario(false); onReload() }} onCancel={() => setEditingScenario(false)} />
  if (selectedTask) return (
    <TaskDetail scenario={scenario} task={selectedTask}
      onBack={() => { setSelectedTask(null); onReload() }}
      onReload={() => {
        apiClient.get(`/teacher/scenarios/${scenario.id}`).then(r => {
          const t = r.data.tasks.find((t: Task) => t.id === selectedTask.id)
          if (t) setSelectedTask(t)
        })
        onReload()
      }} />
  )

  const deleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return
    await apiClient.delete(`/teacher/tasks/${taskId}`)
    onReload()
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-4">← All Scenarios</button>
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-semibold text-gray-900">{scenario.title}</h2>
              <Badge status={scenario.status} />
            </div>
            {scenario.description && <p className="text-sm text-gray-500">{scenario.description}</p>}
          </div>
          <button onClick={() => setEditingScenario(true)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Edit</button>
        </div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700">Tasks ({scenario.tasks.length})</h3>
        <div className="flex gap-2">
          <button onClick={startEditWeights} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Edit Weights</button>
          <button onClick={() => setAddingTask(true)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Add Task</button>
        </div>
      </div>
      {editingWeights && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 mb-3">Task Weights (relative score contribution)</p>
          <div className="space-y-2">
            {[...scenario.tasks].sort((a, b) => a.sequence_order - b.sequence_order).map(t => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 flex-1">#{t.sequence_order + 1} {t.title}</span>
                <input
                  type="number" min="0" step="0.05"
                  value={weights[t.id] ?? '1'}
                  onChange={e => setWeights(w => ({ ...w, [t.id]: e.target.value }))}
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={saveWeights} className="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">Save Weights</button>
            <button onClick={() => setEditingWeights(false)} className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
      {addingTask && (
        <div className="mb-4">
          <TaskForm scenarioId={scenario.id} nextOrder={scenario.tasks.length} onSave={() => { setAddingTask(false); onReload() }} onCancel={() => setAddingTask(false)} />
        </div>
      )}
      {scenario.tasks.length === 0 ? (
        <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">No tasks yet.</div>
      ) : (
        <div className="space-y-2">
          {[...scenario.tasks].sort((a, b) => a.sequence_order - b.sequence_order).map(task => (
            <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">#{task.sequence_order + 1}</span>
                  <span className="font-medium text-gray-900">{task.title}</span>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{task.task_type}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {task.materials.length} material{task.materials.length !== 1 ? 's' : ''}
                  {task.time_limit_seconds ? ` · ${Math.floor(task.time_limit_seconds / 60)}m` : ''}
                  {` · weight: ${task.weight ?? 1}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSelectedTask(task)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Manage →</button>
                <button onClick={() => deleteTask(task.id)} className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskForm({ scenarioId, initial, nextOrder = 0, onSave, onCancel }: {
  scenarioId: string; initial?: Task; nextOrder?: number; onSave: () => void; onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [taskType, setTaskType] = useState(initial?.task_type ?? 'reading')
  const [order] = useState(initial?.sequence_order ?? nextOrder)
  const [timeLimit, setTimeLimit] = useState(initial?.time_limit_seconds ? String(initial.time_limit_seconds) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    const body = { title, description: description || null, task_type: taskType, sequence_order: order, time_limit_seconds: timeLimit ? parseInt(timeLimit) : null }
    try {
      if (initial) await apiClient.put(`/teacher/tasks/${initial.id}`, body)
      else await apiClient.post(`/teacher/scenarios/${scenarioId}/tasks`, body)
      onSave()
    } catch (e: any) { setError(e.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
      <h4 className="font-semibold text-gray-700 mb-4">{initial ? 'Edit Task' : 'New Task'}</h4>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Task Type</label>
          <select value={taskType} onChange={e => setTaskType(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Time Limit (seconds)</label>
          <input type="number" value={timeLimit} onChange={e => setTimeLimit(e.target.value)} placeholder="e.g. 900"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Description / Instructions</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save Task'}</button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  )
}

function TaskDetail({ scenario, task, onBack, onReload }: { scenario: Scenario; task: Task; onBack: () => void; onReload: () => void }) {
  const [editingTask, setEditingTask] = useState(false)
  const [addingMaterial, setAddingMaterial] = useState(false)

  const deleteMaterial = async (materialId: string) => {
    if (!confirm('Delete this material?')) return
    await apiClient.delete(`/teacher/materials/${materialId}`)
    onReload()
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-4">← {scenario.title}</button>
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        {editingTask
          ? <TaskForm scenarioId={scenario.id} initial={task} onSave={() => { setEditingTask(false); onReload() }} onCancel={() => setEditingTask(false)} />
          : (
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-semibold text-gray-900">{task.title}</h2>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-sm">{task.task_type}</span>
                </div>
                {task.description && <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{task.description}</p>}
                {task.time_limit_seconds && <p className="text-xs text-gray-400 mt-1">Time limit: {Math.floor(task.time_limit_seconds / 60)} min</p>}
              </div>
              <button onClick={() => setEditingTask(true)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Edit Task</button>
            </div>
          )}
      </div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700">Materials ({task.materials.length})</h3>
        <button onClick={() => setAddingMaterial(true)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Add Material</button>
      </div>
      {addingMaterial && <div className="mb-4"><MaterialForm taskId={task.id} onSave={() => { setAddingMaterial(false); onReload() }} onCancel={() => setAddingMaterial(false)} /></div>}
      {task.materials.length === 0
        ? <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">No materials yet.</div>
        : <div className="space-y-3">{task.materials.map(m => <MaterialCard key={m.id} material={m} taskId={task.id} onDelete={() => deleteMaterial(m.id)} onReload={onReload} />)}</div>}
    </div>
  )
}

function MaterialCard({ material, taskId, onDelete, onReload }: { material: Material; taskId: string; onDelete: () => void; onReload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState('')

  const meta = (() => { try { return material.metadata_json ? JSON.parse(material.metadata_json) : {} } catch { return {} } })()
  const storedTranscript: string = meta.transcript || ''

  const handleTranscribe = async () => {
    setTranscribing(true)
    setTranscribeError('')
    try {
      await apiClient.post(`/teacher/materials/${material.id}/transcribe`)
      onReload()
    } catch (e: any) {
      setTranscribeError(e?.response?.data?.detail || 'Transcription failed')
    } finally {
      setTranscribing(false)
    }
  }

  if (editing) return <MaterialForm taskId={taskId} initial={material} onSave={() => { setEditing(false); onReload() }} onCancel={() => setEditing(false)} />
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{material.material_type}</span>
            {material.storage_key && <span className="text-xs text-gray-400">📎 {material.storage_key.split('/').pop()}</span>}
          </div>
          {material.content && (
            material.material_type === 'audio'
              ? (
                <div>
                  <audio src={material.content} controls className="w-full mt-2" />
                  {storedTranscript ? (
                    <details className="mt-3">
                      <summary className="text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                        Transcript ({storedTranscript.split(/\s+/).length} words)
                      </summary>
                      <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">
                        {storedTranscript}
                      </p>
                    </details>
                  ) : (
                    <p className="mt-2 text-xs text-amber-600 italic">No transcript yet — click Transcribe to generate one.</p>
                  )}
                  {transcribeError && <p className="mt-1 text-xs text-red-500">{transcribeError}</p>}
                </div>
              )
              : FILE_MATERIAL_TYPES.includes(material.material_type) && material.storage_key
                ? <a href={material.content} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline mt-1 inline-block">
                    Download {meta.filename || 'file'}
                  </a>
                : <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{material.content}</p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {material.material_type === 'audio' && (
            <button
              onClick={handleTranscribe}
              disabled={transcribing}
              className="px-3 py-1 text-xs border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-50"
            >
              {transcribing ? 'Transcribing…' : storedTranscript ? 'Re-transcribe' : 'Transcribe'}
            </button>
          )}
          <button onClick={() => setEditing(true)} className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Edit</button>
          <button onClick={onDelete} className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── TTS constants ──────────────────────────────────────────────────────────────

const TTS_VOICES = [
  { id: 'Wise_Woman',        label: 'Wise Woman (female, mature)' },
  { id: 'Calm_Woman',        label: 'Calm Woman (female, calm)' },
  { id: 'Friendly_Person',   label: 'Friendly Person (neutral)' },
  { id: 'Lively_Girl',       label: 'Lively Girl (female, upbeat)' },
  { id: 'Lovely_Girl',       label: 'Lovely Girl (female, soft)' },
  { id: 'Inspirational_girl',label: 'Inspirational Girl (female, energetic)' },
  { id: 'Deep_Voice_Man',    label: 'Deep Voice Man (male, deep)' },
  { id: 'Patient_Man',       label: 'Patient Man (male, calm)' },
  { id: 'Casual_Guy',        label: 'Casual Guy (male, relaxed)' },
  { id: 'Elegant_Man',       label: 'Elegant Man (male, refined)' },
  { id: 'Determined_Man',    label: 'Determined Man (male, firm)' },
  { id: 'presenter_male',    label: 'Presenter Male (ZH, anchor)' },
  { id: 'presenter_female',  label: 'Presenter Female (ZH, anchor)' },
  { id: 'audiobook_male_1',  label: 'Audiobook Male (ZH)' },
  { id: 'audiobook_female_1',label: 'Audiobook Female (ZH)' },
]

const TTS_MODELS = [
  { id: 'speech-02-hd',     label: 'Speech-02 HD (best quality)' },
  { id: 'speech-02-turbo',  label: 'Speech-02 Turbo (faster)' },
  { id: 'speech-01-hd',     label: 'Speech-01 HD' },
  { id: 'speech-01-turbo',  label: 'Speech-01 Turbo' },
]

// ── MaterialForm ────────────────────────────────────────────────────────────────

function MaterialForm({ taskId, initial, onSave, onCancel }: { taskId: string; initial?: Material; onSave: () => void; onCancel: () => void }) {
  const [type, setType] = useState(initial?.material_type ?? 'advertisement')
  const [content, setContent] = useState(initial?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // TTS state
  const [audioMode, setAudioMode] = useState<'upload' | 'tts'>('upload')
  const [ttsText, setTtsText]       = useState('')
  const [ttsVoice, setTtsVoice]     = useState('Wise_Woman')
  const [ttsModel, setTtsModel]     = useState('speech-02-hd')
  const [ttsSpeed, setTtsSpeed]     = useState(1.0)
  const [ttsVol, setTtsVol]         = useState(1.0)
  const [ttsPitch, setTtsPitch]     = useState(0)
  const [ttsFormat, setTtsFormat]   = useState('mp3')
  const [ttsSampleRate, setTtsSampleRate] = useState(32000)

  const isAudio    = type === 'audio'
  const isDocument = FILE_MATERIAL_TYPES.includes(type)
  const isFileType = isAudio || isDocument

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (isAudio && audioMode === 'tts') {
        if (!ttsText.trim()) { setError('Please enter the text to synthesise'); setSaving(false); return }
        await apiClient.post(`/teacher/tasks/${taskId}/materials/generate-audio-tts`, {
          text: ttsText,
          voice_id: ttsVoice,
          model: ttsModel,
          speed: ttsSpeed,
          vol: ttsVol,
          pitch: ttsPitch,
          audio_format: ttsFormat,
          sample_rate: ttsSampleRate,
        })
      } else if (isAudio && uploadFile) {
        const form = new FormData()
        form.append('file', uploadFile)
        await apiClient.post(`/teacher/tasks/${taskId}/materials/upload-audio`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      } else if (isDocument && uploadFile) {
        const form = new FormData()
        form.append('file', uploadFile)
        await apiClient.post(
          `/teacher/tasks/${taskId}/materials/upload-document?material_type=${type}`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
      } else if (initial && isFileType && !uploadFile) {
        onSave(); return
      } else if (initial) {
        await apiClient.put(`/teacher/materials/${initial.id}`, { material_type: type, content: content || null })
      } else {
        if (!content.trim()) { setError('Content is required'); setSaving(false); return }
        await apiClient.post(`/teacher/tasks/${taskId}/materials`, { material_type: type, content })
      }
      onSave()
    } catch (e: any) { setError(e.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
      <h4 className="font-semibold text-gray-700 mb-4">{initial ? 'Edit Material' : 'Add Material'}</h4>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {!initial && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Material Type</label>
          <select value={type} onChange={e => { setType(e.target.value); setUploadFile(null) }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {MATERIAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Audio: toggle upload / TTS */}
      {isAudio && (
        <div className="mb-4">
          <div className="flex rounded-lg overflow-hidden border border-gray-300 w-fit">
            {(['upload', 'tts'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setAudioMode(mode)}
                className={`px-4 py-2 text-sm font-medium transition-colors
                  ${audioMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {mode === 'upload' ? '⬆ Upload File' : '🎙 Generate from Text (TTS)'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Upload mode (audio or document) */}
      {isFileType && (!isAudio || audioMode === 'upload') && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isAudio ? 'Audio File (MP3/WAV)' : 'Document File (PDF/DOCX)'}
          </label>
          {initial?.storage_key && (
            <p className="text-xs text-gray-400 mb-2">Current: {initial.storage_key.split('/').pop()}</p>
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">
              {initial ? 'Replace File' : 'Choose File'}
            </button>
            <span className="text-sm text-gray-500">
              {uploadFile ? uploadFile.name : initial ? 'No new file selected (keep current)' : 'No file selected'}
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={isAudio ? 'audio/*' : '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
            className="hidden"
            onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {/* TTS mode */}
      {isAudio && audioMode === 'tts' && (
        <div className="space-y-4">
          {/* Script */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Script text <span className="text-gray-400">({ttsText.length} chars)</span>
            </label>
            <textarea
              value={ttsText}
              onChange={e => setTtsText(e.target.value)}
              rows={6}
              placeholder="Enter the text to be read aloud…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y font-mono
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Voice + Model row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Voice</label>
              <select value={ttsVoice} onChange={e => setTtsVoice(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TTS_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
              <select value={ttsModel} onChange={e => setTtsModel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TTS_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {/* Sliders row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Speed <span className="text-blue-600 font-mono">{ttsSpeed.toFixed(1)}×</span>
              </label>
              <input type="range" min={0.5} max={2.0} step={0.1} value={ttsSpeed}
                onChange={e => setTtsSpeed(parseFloat(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>0.5×</span><span>2.0×</span></div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Volume <span className="text-blue-600 font-mono">{ttsVol.toFixed(1)}</span>
              </label>
              <input type="range" min={0.1} max={10.0} step={0.1} value={ttsVol}
                onChange={e => setTtsVol(parseFloat(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>0.1</span><span>10.0</span></div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Pitch <span className="text-blue-600 font-mono">{ttsPitch > 0 ? `+${ttsPitch}` : ttsPitch}</span>
              </label>
              <input type="range" min={-12} max={12} step={1} value={ttsPitch}
                onChange={e => setTtsPitch(parseInt(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>-12</span><span>+12</span></div>
            </div>
          </div>

          {/* Format + Sample Rate row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Output Format</label>
              <select value={ttsFormat} onChange={e => setTtsFormat(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
                <option value="flac">FLAC</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sample Rate</label>
              <select value={ttsSampleRate} onChange={e => setTtsSampleRate(parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value={16000}>16 kHz</option>
                <option value={24000}>24 kHz</option>
                <option value={32000}>32 kHz (recommended)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Text content (non-file types) */}
      {!isFileType && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Content</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
          {saving && (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          )}
          {saving
            ? (isAudio && audioMode === 'tts' ? 'Generating…' : 'Saving…')
            : (isAudio && audioMode === 'tts' ? '🎙 Generate & Save' : 'Save')}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  )
}

// ── Rubric Matrix tab ──────────────────────────────────────────────────────────

function RubricMatrixTab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [rubric, setRubric] = useState<RubricOut | null>(null)
  const [loadingRubric, setLoadingRubric] = useState(false)
  const [editingCriterion, setEditingCriterion] = useState<CriterionOut | null>(null)
  const [addingCriterion, setAddingCriterion] = useState(false)
  const [creatingRubric, setCreatingRubric] = useState(false)

  useEffect(() => {
    apiClient.get('/teacher/scenarios').then(r => setScenarios(r.data)).catch(console.error)
  }, [])

  const loadRubric = async (taskId: string) => {
    setLoadingRubric(true)
    setRubric(null)
    try {
      const r = await apiClient.get(`/admin/rubrics?task_id=${taskId}`)
      const list: RubricOut[] = r.data
      setRubric(list.length > 0 ? list[0] : null)
    } catch (e) { console.error(e) }
    finally { setLoadingRubric(false) }
  }

  const selectTask = (task: Task) => {
    setSelectedTask(task)
    setAddingCriterion(false)
    setEditingCriterion(null)
    loadRubric(task.id)
  }

  const handleCreateRubric = async () => {
    if (!selectedTask) return
    setCreatingRubric(true)
    try {
      const r = await apiClient.post('/admin/rubrics', { task_id: selectedTask.id, name: `${selectedTask.title} Rubric` })
      setRubric(r.data)
    } catch (e: any) { alert(e.response?.data?.detail || 'Failed') }
    finally { setCreatingRubric(false) }
  }

  const handleDeleteRubric = async () => {
    if (!rubric || !confirm('Delete this entire rubric and all criteria?')) return
    await apiClient.delete(`/admin/rubrics/${rubric.id}`)
    setRubric(null)
  }

  const handleDeleteCriterion = async (criterionId: string) => {
    if (!confirm('Delete this criterion?')) return
    await apiClient.delete(`/admin/criteria/${criterionId}`)
    if (selectedTask) loadRubric(selectedTask.id)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Rubric Matrix Management</h2>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: scenario/task picker */}
        <div className="col-span-1 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Scenarios & Tasks</p>
          {scenarios.map(sc => (
            <div key={sc.id}>
              <button
                onClick={() => { setSelectedScenario(sc === selectedScenario ? null : sc); setSelectedTask(null); setRubric(null) }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${selectedScenario?.id === sc.id ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}>
                {sc.title}
              </button>
              {selectedScenario?.id === sc.id && sc.tasks.length > 0 && (
                <div className="ml-3 mt-1 space-y-1">
                  {[...sc.tasks].sort((a, b) => a.sequence_order - b.sequence_order).map(t => (
                    <button key={t.id} onClick={() => selectTask(t)}
                      className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors
                        ${selectedTask?.id === t.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                      #{t.sequence_order + 1} {t.title}
                      <span className="ml-1 text-gray-400">({t.task_type})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right: rubric matrix */}
        <div className="col-span-2">
          {!selectedTask && (
            <div className="text-center py-16 text-gray-400">Select a task on the left to manage its rubric.</div>
          )}

          {selectedTask && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-800">{selectedTask.title}</h3>
                  <p className="text-xs text-gray-500">{selectedTask.task_type}</p>
                </div>
                {rubric
                  ? <div className="flex gap-2">
                      <button onClick={() => setAddingCriterion(true)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Add Criterion</button>
                      <button onClick={handleDeleteRubric} className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50">Delete Rubric</button>
                    </div>
                  : <button onClick={handleCreateRubric} disabled={creatingRubric} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">{creatingRubric ? 'Creating…' : 'Create Rubric'}</button>}
              </div>

              {loadingRubric && <div className="text-center py-8 text-gray-400">Loading…</div>}

              {!loadingRubric && !rubric && (
                <div className="text-center py-12 bg-white border border-dashed border-gray-300 rounded-xl text-gray-400">
                  No rubric for this task. Click "Create Rubric" to add one.
                </div>
              )}

              {!loadingRubric && rubric && (
                <div className="space-y-4">
                  {/* Add criterion form */}
                  {addingCriterion && (
                    <CriterionForm
                      onSave={async (data) => {
                        await apiClient.post(`/admin/rubrics/${rubric.id}/criteria`, data)
                        setAddingCriterion(false)
                        loadRubric(selectedTask.id)
                      }}
                      onCancel={() => setAddingCriterion(false)}
                    />
                  )}

                  {/* Criteria matrix */}
                  {rubric.criteria.length === 0 && !addingCriterion && (
                    <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                      No criteria yet. Add your first criterion above.
                    </div>
                  )}

                  {rubric.criteria.map(c => (
                    <div key={c.id}>
                      {editingCriterion?.id === c.id
                        ? <CriterionForm
                            initial={c}
                            onSave={async (data) => {
                              await apiClient.patch(`/admin/criteria/${c.id}`, data)
                              setEditingCriterion(null)
                              loadRubric(selectedTask.id)
                            }}
                            onCancel={() => setEditingCriterion(null)}
                          />
                        : <CriterionCard
                            criterion={c}
                            onEdit={() => setEditingCriterion(c)}
                            onDelete={() => handleDeleteCriterion(c.id)}
                          />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CriterionCard({ criterion: c, onEdit, onDelete }: { criterion: CriterionOut; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900 text-sm">{c.name}</span>
              {c.domain && <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">{c.domain}</span>}
              {c.competence && <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded">{c.competence}</span>}
              <span className="text-xs text-gray-500">max {c.max_score} pts</span>
            </div>
            {c.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{c.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {c.cefr_descriptors && (
            <button onClick={() => setExpanded(e => !e)} className="text-xs text-blue-600 hover:underline">
              {expanded ? 'Hide' : 'CEFR'} ▾
            </button>
          )}
          <button onClick={onEdit} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">Edit</button>
          <button onClick={onDelete} className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">Del</button>
        </div>
      </div>
      {expanded && c.cefr_descriptors && (
        <div className="border-t border-gray-100 grid grid-cols-2 divide-x divide-y divide-gray-100">
          {Object.entries(c.cefr_descriptors).map(([level, desc]) => (
            <div key={level} className="px-3 py-2">
              <span className="text-xs font-bold text-indigo-600">{level}</span>
              <p className="text-xs text-gray-500 mt-0.5">{desc || '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CriterionForm({ initial, onSave, onCancel }: {
  initial?: CriterionOut
  onSave: (data: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [domain, setDomain] = useState(initial?.domain ?? '')
  const [competence, setCompetence] = useState(initial?.competence ?? '')
  const [maxScore, setMaxScore] = useState(String(initial?.max_score ?? 5))
  const [weight] = useState(String(initial?.weight ?? 1))
  // Dynamic CEFR bands: list of [band, descriptor] pairs so order and count are user-controlled
  const initBands = (): [string, string][] => {
    const src = initial?.cefr_descriptors ?? Object.fromEntries(RUBRIC_CEFR_BANDS.map(l => [l, '']))
    return Object.entries(src)
  }
  const [bands, setBands] = useState<[string, string][]>(initBands)
  const [newBandKey, setNewBandKey] = useState('')
  const [saving, setSaving] = useState(false)

  const addBand = () => {
    const key = newBandKey.trim().toUpperCase()
    if (!key || bands.some(([k]) => k === key)) return
    setBands(prev => [...prev, [key, '']])
    setNewBandKey('')
  }
  const removeBand = (idx: number) => setBands(prev => prev.filter((_, i) => i !== idx))
  const setBandDesc = (idx: number, val: string) =>
    setBands(prev => prev.map((b, i) => i === idx ? [b[0], val] : b))

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const descriptorObj = Object.fromEntries(bands.filter(([k]) => k.trim()))
    const cefrFilled = bands.some(([, v]) => v.trim())
    try {
      await onSave({
        name,
        description: description || null,
        domain: domain || null,
        competence: competence || null,
        max_score: parseFloat(maxScore) || 5,
        weight: parseFloat(weight) || 1,
        cefr_descriptors: cefrFilled ? descriptorObj : null,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <h4 className="font-semibold text-gray-700 text-sm">{initial ? 'Edit Criterion' : 'New Criterion'}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Domain</label>
          <select value={domain} onChange={e => setDomain(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— none —</option>
            {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Competence</label>
          <select value={competence} onChange={e => setCompetence(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— none —</option>
            {COMPETENCES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Score</label>
          <input type="number" value={maxScore} onChange={e => setMaxScore(e.target.value)} min="0"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-600">CEFR Band Descriptors</label>
          <div className="flex items-center gap-1">
            <input value={newBandKey} onChange={e => setNewBandKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBand()}
              placeholder="e.g. B2" maxLength={4}
              className="w-16 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <button type="button" onClick={addBand}
              className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-xs hover:bg-indigo-100 border border-indigo-200">
              + Band
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {bands.map(([level, desc], idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <div className="w-12 shrink-0 pt-1 text-center">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{level}</span>
              </div>
              <textarea value={desc} rows={2}
                onChange={e => setBandDesc(idx, e.target.value)}
                placeholder={`${level} descriptor…`}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <button type="button" onClick={() => removeBand(idx)}
                className="text-red-400 hover:text-red-600 text-xs pt-1">✕</button>
            </div>
          ))}
          {bands.length === 0 && (
            <p className="text-xs text-gray-400 italic">No bands yet — type a band label above and click + Band.</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  )
}

// ── Prompt Templates tab ───────────────────────────────────────────────────────

interface PromptTemplate {
  id: string
  name: string
  template_type: string
  system_prompt: string
  user_prompt_template: string
  is_active: boolean
  task_ids: string[]
}

interface TaskSummary {
  id: string
  title: string
  task_type: string
  sequence_order: number
}

interface ScenarioWithTasks {
  id: string
  title: string
  tasks: TaskSummary[]
}

function PromptTemplatesTab() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PromptTemplate | null>(null)
  const [creating, setCreating] = useState(false)

  const reload = () => {
    setLoading(true)
    apiClient.get('/admin/prompt-templates')
      .then(r => setTemplates(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this prompt template?')) return
    await apiClient.delete(`/admin/prompt-templates/${id}`)
    reload()
  }

  if (creating) return <PromptTemplateForm onSave={() => { setCreating(false); reload() }} onCancel={() => setCreating(false)} />
  if (selected) return <PromptTemplateForm initial={selected} onSave={() => { setSelected(null); reload() }} onCancel={() => setSelected(null)} />

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Prompt Templates</h2>
        <button onClick={() => setCreating(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ New Template</button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No prompt templates yet.</div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between">
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-gray-900 text-sm font-mono">{t.name}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">{t.template_type}</span>
                  {t.task_ids.length > 0
                    ? <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{t.task_ids.length} task{t.task_ids.length > 1 ? 's' : ''}</span>
                    : <span className="text-xs px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded">no task assigned</span>
                  }
                  {!t.is_active && <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded">Inactive</span>}
                </div>
                <p className="text-xs text-gray-400 truncate">{t.system_prompt.slice(0, 120)}…</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setSelected(t)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Edit</button>
                <button onClick={() => deleteTemplate(t.id)} className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PromptTemplateForm({ initial, onSave, onCancel }: {
  initial?: PromptTemplate; onSave: () => void; onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [templateType, setTemplateType] = useState(initial?.template_type ?? 'scoring')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? '')
  const [userPrompt, setUserPrompt] = useState(initial?.user_prompt_template ?? '')
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(initial?.task_ids ?? [])
  const [scenarios, setScenarios] = useState<ScenarioWithTasks[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiClient.get('/admin/scenarios-with-tasks')
      .then(r => setScenarios(r.data))
      .catch(console.error)
  }, [])

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    )
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!systemPrompt.trim()) { setError('System prompt is required'); return }
    if (!userPrompt.trim()) { setError('User prompt template is required'); return }
    setSaving(true); setError('')
    const body = {
      name, template_type: templateType,
      is_active: isActive,
      system_prompt: systemPrompt,
      user_prompt_template: userPrompt,
      task_ids: selectedTaskIds,
    }
    try {
      if (initial) await apiClient.put(`/admin/prompt-templates/${initial.id}`, body)
      else await apiClient.post('/admin/prompt-templates', body)
      onSave()
    } catch (e: any) { setError(e.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={onCancel} className="text-sm text-blue-600 hover:underline mb-4">← Back to Templates</button>
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">{initial ? 'Edit Template' : 'New Prompt Template'}</h3>
        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Name (unique code) *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. S4_T1_READING_NOTES_SCORING_v1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Template Type</label>
            <input value={templateType} onChange={e => setTemplateType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-2 self-end pb-2">
            <input type="checkbox" id="pt_active" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4" />
            <label htmlFor="pt_active" className="text-sm text-gray-700">Active</label>
          </div>
        </div>

        {/* Task assignment */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">
            Applicable Tasks
            <span className="ml-1 font-normal text-gray-400">(select which scenario/task combinations this template applies to)</span>
          </label>
          {scenarios.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No scenarios found.</p>
          ) : (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {scenarios.map(scenario => (
                <div key={scenario.id} className="p-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">{scenario.title}</p>
                  <div className="space-y-1 pl-2">
                    {scenario.tasks.map(task => (
                      <label key={task.id} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.includes(task.id)}
                          onChange={() => toggleTask(task.id)}
                          className="w-3.5 h-3.5 rounded"
                        />
                        <span className="text-xs text-gray-700 group-hover:text-gray-900">
                          Task {task.sequence_order + 1} — {task.title}
                        </span>
                        <span className="text-xs px-1 py-0.5 bg-gray-100 text-gray-500 rounded">{task.task_type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {selectedTaskIds.length > 0 && (
            <p className="text-xs text-blue-600 mt-1">{selectedTaskIds.length} task{selectedTaskIds.length > 1 ? 's' : ''} selected</p>
          )}
        </div>

        {/* Available variables reference */}
        <details className="border border-gray-200 rounded-lg">
          <summary className="px-3 py-2 text-xs font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-50">
            Available template variables <span className="font-normal text-gray-400">(click to expand)</span>
          </summary>
          <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-x-6 gap-y-1">
            {[
              ['{task_title}', 'Task title'],
              ['{task_type}', 'reading / writing / listening / speaking'],
              ['{task_description}', 'Task description'],
              ['{materials}', 'All text materials joined (type header + content)'],
              ['{material_<type>}', 'Material by type, e.g. {material_job_ad}'],
              ['{criteria}', 'Criteria list with max scores and descriptions'],
              ['{criteria_with_bands}', 'Criteria + CEFR band descriptors per criterion'],
              ['{submission}', "Student's text response (writing / reading / listening)"],
              ['{transcription}', "Student's speech transcribed (speaking)"],
              ['{max_score}', 'Highest single criterion max score'],
              ['{total_max_score}', 'Sum of all criteria max scores'],
              ['{json_format}', 'Reminder of the required JSON output format'],
            ].map(([v, desc]) => (
              <div key={v} className="flex gap-2 items-start py-0.5">
                <code className="text-xs font-mono text-purple-700 whitespace-nowrap flex-shrink-0">{v}</code>
                <span className="text-xs text-gray-500">{desc}</span>
              </div>
            ))}
          </div>
        </details>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">System Prompt *</label>
          <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            User Prompt Template * <span className="text-gray-400 font-normal">(use {'{variable}'} placeholders from the list above)</span>
          </label>
          <textarea value={userPrompt} onChange={e => setUserPrompt(e.target.value)} rows={16}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Template'}
          </button>
          <button onClick={onCancel} className="px-5 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  materials: Material[]
}

interface Scenario {
  id: string
  title: string
  description: string | null
  status: string
  tasks: Task[]
}

interface ScoreResult {
  attempt_id: string
  cefr_level: string
  overall_score: number
  overall_score_max: number
  task_results: {
    task_type: string
    score: number
    max_score: number
    cefr_level: string
    overall_feedback: string
  }[]
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const TASK_TYPES = ['reading', 'writing', 'listening', 'speaking']
const MATERIAL_TYPES = ['advertisement', 'resume', 'job_description', 'notes', 'audio', 'other']
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

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = 'scenarios' | 'scoring' | 'review'

export default function TeacherDashboard({ userName }: { userName: string }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('scenarios')

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-gray-900">LCCA — Teacher</span>
          <nav className="flex gap-1">
            {(['scenarios', 'scoring', 'review'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors
                  ${tab === t ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t === 'scenarios' ? 'Scenarios & Tasks' : t === 'scoring' ? 'Score Attempts' : 'Review Results'}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{userName}</span>
          <button onClick={handleLogout}
            className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 p-6">
        {tab === 'scenarios' && <ScenariosTab />}
        {tab === 'scoring' && <ScoringTab />}
        {tab === 'review' && <ReviewTab />}
      </main>
    </div>
  )
}

// ── Scenarios tab ──────────────────────────────────────────────────────────────

function ScenariosTab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Scenario | null>(null)
  const [creating, setCreating] = useState(false)

  const reload = () => {
    setLoading(true)
    apiClient.get('/teacher/scenarios')
      .then(r => setScenarios(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  const select = (s: Scenario) => {
    // Reload full scenario to get tasks+materials
    apiClient.get(`/teacher/scenarios/${s.id}`).then(r => setSelected(r.data))
  }

  if (creating) {
    return <ScenarioForm onSave={() => { setCreating(false); reload() }} onCancel={() => setCreating(false)} />
  }

  if (selected) {
    return (
      <ScenarioDetail
        scenario={selected}
        onBack={() => { setSelected(null); reload() }}
        onReload={() => apiClient.get(`/teacher/scenarios/${selected.id}`).then(r => setSelected(r.data))}
      />
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">My Scenarios</h2>
        <button onClick={() => setCreating(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + New Scenario
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => (
          <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
        ))}</div>
      ) : scenarios.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No scenarios yet. Click "New Scenario" to create one.
        </div>
      ) : (
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
              <button onClick={() => select(s)}
                className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Manage →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Scenario form (create / edit) ──────────────────────────────────────────────

function ScenarioForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Scenario
  onSave: (s: Scenario) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'draft')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      let r
      if (initial) {
        r = await apiClient.put(`/teacher/scenarios/${initial.id}`, { title, description, status })
      } else {
        r = await apiClient.post('/teacher/scenarios', { title, description, status })
      }
      onSave(r.data)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
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
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="px-5 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Scenario detail (tasks list) ───────────────────────────────────────────────

function ScenarioDetail({ scenario, onBack, onReload }: { scenario: Scenario; onBack: () => void; onReload: () => void }) {
  const [editingScenario, setEditingScenario] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [addingTask, setAddingTask] = useState(false)

  if (editingScenario) {
    return <ScenarioForm initial={scenario} onSave={() => { setEditingScenario(false); onReload() }} onCancel={() => setEditingScenario(false)} />
  }

  if (selectedTask) {
    return (
      <TaskDetail
        scenario={scenario}
        task={selectedTask}
        onBack={() => { setSelectedTask(null); onReload() }}
        onReload={() => {
          apiClient.get(`/teacher/scenarios/${scenario.id}`).then(r => {
            const t = r.data.tasks.find((t: Task) => t.id === selectedTask.id)
            if (t) setSelectedTask(t)
          })
          onReload()
        }}
      />
    )
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm('Delete this task and all its materials?')) return
    await apiClient.delete(`/teacher/tasks/${taskId}`)
    onReload()
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1">
        ← All Scenarios
      </button>

      {/* Scenario header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-semibold text-gray-900">{scenario.title}</h2>
              <Badge status={scenario.status} />
            </div>
            {scenario.description && <p className="text-sm text-gray-500">{scenario.description}</p>}
          </div>
          <button onClick={() => setEditingScenario(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Edit
          </button>
        </div>
      </div>

      {/* Tasks */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700">Tasks ({scenario.tasks.length})</h3>
        <button onClick={() => setAddingTask(true)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + Add Task
        </button>
      </div>

      {addingTask && (
        <div className="mb-4">
          <TaskForm
            scenarioId={scenario.id}
            nextOrder={scenario.tasks.length}
            onSave={() => { setAddingTask(false); onReload() }}
            onCancel={() => setAddingTask(false)}
          />
        </div>
      )}

      {scenario.tasks.length === 0 ? (
        <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
          No tasks yet. Click "Add Task" to create one.
        </div>
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
                  {task.time_limit_seconds ? ` · ${Math.floor(task.time_limit_seconds / 60)}m limit` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSelectedTask(task)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                  Manage →
                </button>
                <button onClick={() => deleteTask(task.id)}
                  className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Task form ──────────────────────────────────────────────────────────────────

function TaskForm({
  scenarioId,
  initial,
  nextOrder = 0,
  onSave,
  onCancel,
}: {
  scenarioId: string
  initial?: Task
  nextOrder?: number
  onSave: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [taskType, setTaskType] = useState(initial?.task_type ?? 'reading')
  const [order, setOrder] = useState(initial?.sequence_order ?? nextOrder)
  const [timeLimit, setTimeLimit] = useState(initial?.time_limit_seconds ? String(initial.time_limit_seconds) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    const body = {
      title,
      description: description || null,
      task_type: taskType,
      sequence_order: order,
      time_limit_seconds: timeLimit ? parseInt(timeLimit) : null,
    }
    try {
      if (initial) {
        await apiClient.put(`/teacher/tasks/${initial.id}`, body)
      } else {
        await apiClient.post(`/teacher/scenarios/${scenarioId}/tasks`, body)
      }
      onSave()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
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
          <input type="number" value={timeLimit} onChange={e => setTimeLimit(e.target.value)}
            placeholder="e.g. 900 = 15 min"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sequence Order</label>
          <input type="number" value={order} onChange={e => setOrder(parseInt(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Description / Instructions</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Task'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Task detail (materials) ────────────────────────────────────────────────────

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
      {/* Breadcrumb */}
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-4">
        ← {scenario.title}
      </button>

      {/* Task header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        {editingTask ? (
          <TaskForm
            scenarioId={scenario.id}
            initial={task}
            onSave={() => { setEditingTask(false); onReload() }}
            onCancel={() => setEditingTask(false)}
          />
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-semibold text-gray-900">{task.title}</h2>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-sm">{task.task_type}</span>
              </div>
              {task.description && <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{task.description}</p>}
              {task.time_limit_seconds && (
                <p className="text-xs text-gray-400 mt-1">Time limit: {Math.floor(task.time_limit_seconds / 60)} min</p>
              )}
            </div>
            <button onClick={() => setEditingTask(true)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Edit Task
            </button>
          </div>
        )}
      </div>

      {/* Materials */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700">Materials ({task.materials.length})</h3>
        <button onClick={() => setAddingMaterial(true)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + Add Material
        </button>
      </div>

      {addingMaterial && (
        <div className="mb-4">
          <MaterialForm
            taskId={task.id}
            onSave={() => { setAddingMaterial(false); onReload() }}
            onCancel={() => setAddingMaterial(false)}
          />
        </div>
      )}

      {task.materials.length === 0 ? (
        <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
          No materials yet.
          {task.task_type === 'reading' && ' Add an "advertisement" material with the reading text.'}
          {task.task_type === 'writing' && ' Add "resume" and "job_description" materials.'}
          {task.task_type === 'listening' && ' Upload an "audio" file.'}
          {task.task_type === 'speaking' && ' Add instructions as "notes" material.'}
        </div>
      ) : (
        <div className="space-y-3">
          {task.materials.map(m => (
            <MaterialCard key={m.id} material={m} taskId={task.id} onDelete={() => deleteMaterial(m.id)} onReload={onReload} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Material card (view + inline edit) ────────────────────────────────────────

function MaterialCard({ material, taskId, onDelete, onReload }: { material: Material; taskId: string; onDelete: () => void; onReload: () => void }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <MaterialForm taskId={taskId} initial={material}
        onSave={() => { setEditing(false); onReload() }}
        onCancel={() => setEditing(false)} />
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{material.material_type}</span>
            {material.storage_key && (
              <span className="text-xs text-gray-400">📎 {material.storage_key.split('/').pop()}</span>
            )}
          </div>
          {material.content && (
            material.material_type === 'audio'
              ? <audio src={material.content} controls className="w-full mt-2" />
              : <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{material.content}</p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setEditing(true)}
            className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
            Edit
          </button>
          <button onClick={onDelete}
            className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Material form ──────────────────────────────────────────────────────────────

function MaterialForm({
  taskId,
  initial,
  onSave,
  onCancel,
}: {
  taskId: string
  initial?: Material
  onSave: () => void
  onCancel: () => void
}) {
  const [type, setType] = useState(initial?.material_type ?? 'advertisement')
  const [content, setContent] = useState(initial?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isAudio = type === 'audio'

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (initial) {
        await apiClient.put(`/teacher/materials/${initial.id}`, {
          material_type: type,
          content: content || null,
        })
      } else if (isAudio && audioFile) {
        const form = new FormData()
        form.append('file', audioFile)
        await apiClient.post(`/teacher/tasks/${taskId}/materials/upload-audio`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else {
        if (!content.trim()) { setError('Content is required'); setSaving(false); return }
        await apiClient.post(`/teacher/tasks/${taskId}/materials`, {
          material_type: type,
          content,
        })
      }
      onSave()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
      <h4 className="font-semibold text-gray-700 mb-4">{initial ? 'Edit Material' : 'Add Material'}</h4>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {!initial && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Material Type</label>
          <select value={type} onChange={e => setType(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {MATERIAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            {type === 'advertisement' && 'Reading passage shown to students in Task 1'}
            {type === 'resume' && 'Candidate resume shown in Task 2 reference panel'}
            {type === 'job_description' && 'Job posting shown in Task 2 reference panel'}
            {type === 'notes' && 'Pre-supplied notes shown in Task 2 or as speaking instructions'}
            {type === 'audio' && 'Audio file played in Task 3 (listening)'}
          </p>
        </div>
      )}

      {isAudio && !initial ? (
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Audio File (MP3 / WAV / WebM)</label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">
              Choose File
            </button>
            <span className="text-sm text-gray-500">{audioFile ? audioFile.name : 'No file selected'}</span>
          </div>
          <input ref={fileRef} type="file" accept="audio/*" className="hidden"
            onChange={e => setAudioFile(e.target.files?.[0] ?? null)} />
        </div>
      ) : (
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isAudio ? 'Audio URL (or re-upload via new material)' : 'Content'}
          </label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={8}
            placeholder={isAudio ? 'https://...' : 'Paste text content here…'}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || (isAudio && !initial && !audioFile && !content)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Review tab types ───────────────────────────────────────────────────────────

interface AttemptSummary {
  id: string
  scenario_id: string
  status: string
  submitted_at: string | null
  has_result: boolean
  is_finalized: boolean
  cefr_level: string | null
  overall_score: number | null
  overall_score_max: number | null
}

interface CriterionDetail {
  detail_id: string
  criterion_name: string
  score: number
  max_score: number
  feedback: string
  teacher_score: number | null
  teacher_feedback: string | null
  is_teacher_reviewed: boolean
}

interface TaskDetail {
  task_id: string
  task_type: string
  task_title: string
  score_run_id: string | null
  cefr_level: string
  overall_feedback: string
  transcript: string | null
  criteria: CriterionDetail[]
  total_score: number
  total_max: number
}

interface AttemptDetail {
  id: string
  status: string
  submitted_at: string | null
  cefr_level: string | null
  overall_score: number | null
  overall_score_max: number | null
  band_score: number | null
  teacher_notes: string | null
  is_finalized: boolean
  tasks: TaskDetail[]
}

// ── Review tab ────────────────────────────────────────────────────────────────

function ReviewTab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [attempts, setAttempts] = useState<AttemptSummary[]>([])
  const [loadingAttempts, setLoadingAttempts] = useState(false)
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptDetail | null>(null)

  useEffect(() => {
    apiClient.get('/teacher/scenarios').then(r => {
      const list: Scenario[] = r.data
      setScenarios(list)
      if (list.length > 0) loadAttempts(list[0].id)
    }).catch(console.error)
  }, [])

  const loadAttempts = async (scenarioId: string) => {
    setSelectedScenarioId(scenarioId)
    setAttempts([])
    setSelectedAttempt(null)
    if (!scenarioId) return
    setLoadingAttempts(true)
    try {
      const r = await apiClient.get(`/teacher/review/scenarios/${scenarioId}/attempts`)
      setAttempts(r.data)
    } catch (e) { console.error(e) }
    finally { setLoadingAttempts(false) }
  }

  const loadAttemptDetail = async (attemptId: string) => {
    try {
      const r = await apiClient.get(`/teacher/review/attempts/${attemptId}`)
      setSelectedAttempt(r.data)
    } catch (e) { console.error(e) }
  }

  if (selectedAttempt) {
    return (
      <AttemptReviewPanel
        attempt={selectedAttempt}
        onBack={() => { setSelectedAttempt(null); loadAttempts(selectedScenarioId) }}
        onReload={() => loadAttemptDetail(selectedAttempt.id)}
      />
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Review Student Results</h2>
        <select value={selectedScenarioId} onChange={e => loadAttempts(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Select a scenario…</option>
          {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>

      {loadingAttempts && <div className="text-center py-8 text-gray-400">Loading…</div>}

      {!loadingAttempts && selectedScenarioId && attempts.length === 0 && (
        <div className="text-center py-12 text-gray-400">No attempts for this scenario yet.</div>
      )}

      <div className="space-y-3">
        {attempts.map(a => {
          const pct = a.overall_score != null && a.overall_score_max
            ? Math.round((a.overall_score / a.overall_score_max) * 100) : null
          return (
            <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">
                  Attempt <span className="font-mono">{a.id.slice(0, 8)}…</span>
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    a.status === 'scored' ? 'bg-green-100 text-green-700'
                    : a.status === 'submitted' ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>{a.status}</span>
                  {a.cefr_level && <span className="font-semibold text-blue-600">{a.cefr_level}</span>}
                  {pct != null && <span>{pct}%</span>}
                  {a.is_finalized && <span className="text-green-600 font-medium">Finalised</span>}
                  {a.submitted_at && <span>{new Date(a.submitted_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <button
                onClick={() => loadAttemptDetail(a.id)}
                disabled={!a.has_result}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${a.has_result
                    ? 'border border-gray-300 hover:bg-gray-50'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                {a.has_result ? 'Review →' : 'Not scored'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Attempt review panel ───────────────────────────────────────────────────────

function AttemptReviewPanel({
  attempt,
  onBack,
  onReload,
}: {
  attempt: AttemptDetail
  onBack: () => void
  onReload: () => void
}) {
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Record<string, { score: string; feedback: string }>>({})
  const [finalizing, setFinalizing] = useState(false)
  const [cefrOverride, setCefrOverride] = useState(attempt.cefr_level || '')
  const [teacherNotes, setTeacherNotes] = useState(attempt.teacher_notes || '')

  const startEdit = (c: CriterionDetail) => {
    setEditing(prev => ({
      ...prev,
      [c.detail_id]: {
        score: String(c.teacher_score ?? c.score),
        feedback: c.teacher_feedback ?? c.feedback,
      },
    }))
  }

  const cancelEdit = (detailId: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[detailId]; return n })
  }

  const saveEdit = async (c: CriterionDetail) => {
    const ed = editing[c.detail_id]
    if (!ed) return
    setSaving(prev => ({ ...prev, [c.detail_id]: true }))
    try {
      await apiClient.patch(`/teacher/review/score-details/${c.detail_id}`, {
        teacher_score: parseFloat(ed.score),
        teacher_feedback: ed.feedback,
        is_teacher_reviewed: true,
      })
      cancelEdit(c.detail_id)
      onReload()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(prev => ({ ...prev, [c.detail_id]: false }))
    }
  }

  const handleFinalize = async () => {
    if (!confirm('Finalize this result? The student will see the final score.')) return
    setFinalizing(true)
    try {
      await apiClient.post(`/teacher/review/attempts/${attempt.id}/finalize`, {
        cefr_level: cefrOverride || undefined,
        teacher_notes: teacherNotes || undefined,
      })
      onReload()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Finalize failed')
    } finally {
      setFinalizing(false)
    }
  }

  const totalScore = attempt.overall_score ?? 0
  const totalMax = attempt.overall_score_max ?? 0
  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1">
        ← All Attempts
      </button>

      {/* Attempt header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              Attempt <span className="font-mono text-sm">{attempt.id.slice(0, 8)}…</span>
            </h2>
            <div className="flex items-center gap-3 mt-1 text-sm">
              <span className={`px-2 py-0.5 rounded font-medium ${
                attempt.is_finalized ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {attempt.is_finalized ? 'Finalised' : 'Pending review'}
              </span>
              {attempt.cefr_level && (
                <span className="text-blue-700 font-bold text-lg">{attempt.cefr_level}</span>
              )}
              {totalMax > 0 && (
                <span className="text-gray-600">{pct}% ({totalScore.toFixed(1)} / {totalMax} pts)</span>
              )}
              {attempt.band_score != null && (
                <span className="text-gray-500">Band {attempt.band_score.toFixed(1)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Teacher finalize section */}
        {!attempt.is_finalized && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Override CEFR Level</label>
                <select value={cefrOverride} onChange={e => setCefrOverride(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Keep AI result</option>
                  {['A1','A2','B1','B2','C1','C2'].map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Teacher Notes</label>
                <input value={teacherNotes} onChange={e => setTeacherNotes(e.target.value)}
                  placeholder="Optional notes for student…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <button onClick={handleFinalize} disabled={finalizing}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {finalizing ? 'Finalising…' : 'Finalise & Release to Student'}
            </button>
          </div>
        )}

        {attempt.is_finalized && attempt.teacher_notes && (
          <div className="mt-3 text-sm text-gray-600">
            <span className="font-medium">Teacher notes: </span>{attempt.teacher_notes}
          </div>
        )}
      </div>

      {/* Task breakdown */}
      <div className="space-y-5">
        {attempt.tasks.map((task) => (
          <div key={task.task_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <span className="font-semibold text-gray-800">{task.task_title}</span>
                <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{task.task_type}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-gray-700">{task.cefr_level}</span>
                <span className="text-gray-500">{task.total_score.toFixed(1)} / {task.total_max} pts</span>
              </div>
            </div>

            {task.overall_feedback && (
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800">
                {task.overall_feedback}
              </div>
            )}

            {task.transcript && (
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Transcript</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.transcript}</p>
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {task.criteria.map((c) => {
                const ed = editing[c.detail_id]
                const isSaving = saving[c.detail_id]
                return (
                  <div key={c.detail_id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-gray-700">{c.criterion_name}</span>
                          {c.is_teacher_reviewed && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Reviewed</span>
                          )}
                        </div>
                        {!ed && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {c.is_teacher_reviewed && c.teacher_feedback ? c.teacher_feedback : c.feedback}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm text-gray-700 font-medium">
                          {(c.teacher_score ?? c.score).toFixed(1)} / {c.max_score}
                        </span>
                        {!ed && !attempt.is_finalized && (
                          <button onClick={() => startEdit(c)}
                            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                            Edit
                          </button>
                        )}
                      </div>
                    </div>

                    {ed && (
                      <div className="mt-2 space-y-2 bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-gray-600 w-20">Score (/{c.max_score})</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max={c.max_score}
                            value={ed.score}
                            onChange={e => setEditing(prev => ({ ...prev, [c.detail_id]: { ...prev[c.detail_id], score: e.target.value } }))}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">Feedback</label>
                          <textarea
                            value={ed.feedback}
                            onChange={e => setEditing(prev => ({ ...prev, [c.detail_id]: { ...prev[c.detail_id], feedback: e.target.value } }))}
                            rows={2}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(c)} disabled={isSaving}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                            {isSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => cancelEdit(c.detail_id)}
                            className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Scoring tab ────────────────────────────────────────────────────────────────

function ScoringTab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [attempts, setAttempts] = useState<AttemptSummary[]>([])
  const [scoring, setScoring] = useState<Record<string, 'idle' | 'loading' | 'done'>>({})
  const [scoredResults, setScoredResults] = useState<Record<string, ScoreResult>>({})
  const [loadingAttempts, setLoadingAttempts] = useState(false)

  useEffect(() => {
    apiClient.get('/teacher/scenarios').then(r => {
      const list: Scenario[] = r.data
      setScenarios(list)
      if (list.length > 0) loadAttempts(list[0].id)
    }).catch(console.error)
  }, [])

  const loadAttempts = async (scenarioId: string) => {
    setSelectedScenarioId(scenarioId)
    setAttempts([])
    setScoredResults({})
    if (!scenarioId) return
    setLoadingAttempts(true)
    try {
      // Use teacher review endpoint — returns ALL students' attempts for this scenario
      const r = await apiClient.get(`/teacher/review/scenarios/${scenarioId}/attempts`)
      const all: AttemptSummary[] = r.data
      // Show only unscored attempts (submitted but no result yet)
      setAttempts(all.filter(a => a.status === 'submitted' && !a.has_result))
    } catch (e) { console.error(e) }
    finally { setLoadingAttempts(false) }
  }

  const scoreAttempt = async (attemptId: string) => {
    setScoring(prev => ({ ...prev, [attemptId]: 'loading' }))
    try {
      const r = await apiClient.post(`/scoring/attempt/${attemptId}`)
      setScoredResults(prev => ({ ...prev, [attemptId]: r.data }))
      setScoring(prev => ({ ...prev, [attemptId]: 'done' }))
      setAttempts(prev => prev.filter(a => a.id !== attemptId))
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Scoring failed. Check LLM API key is set.')
      setScoring(prev => ({ ...prev, [attemptId]: 'idle' }))
    }
  }

  const pendingCount = attempts.length
  const scoredThisSession = Object.keys(scoredResults).length

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Score Submitted Attempts</h2>
        <select value={selectedScenarioId} onChange={e => loadAttempts(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Select a scenario…</option>
          {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        {selectedScenarioId && !loadingAttempts && (
          <button onClick={() => loadAttempts(selectedScenarioId)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Refresh
          </button>
        )}
      </div>

      {loadingAttempts && <div className="text-center py-8 text-gray-400">Loading attempts…</div>}

      {!loadingAttempts && selectedScenarioId && pendingCount === 0 && scoredThisSession === 0 && (
        <div className="text-center py-12 text-gray-400">No unscored submitted attempts for this scenario.</div>
      )}

      <div className="space-y-4">
        {attempts.map(a => (
          <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 text-sm">
                Attempt <span className="font-mono">{a.id.slice(0, 8)}…</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Submitted {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}
              </p>
            </div>
            <button onClick={() => scoreAttempt(a.id)} disabled={scoring[a.id] === 'loading'}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                ${scoring[a.id] === 'loading' ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              {scoring[a.id] === 'loading' ? (
                <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg> Scoring…</>
              ) : 'Score with AI'}
            </button>
          </div>
        ))}

        {Object.entries(scoredResults).map(([id, r]) => (
          <div key={id} className="bg-green-50 border border-green-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-green-900">Attempt {id.slice(0, 8)}… — Scored ✓</p>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-green-700">{r.cefr_level}</span>
                <span className="text-sm text-green-600">{r.overall_score.toFixed(1)} / {r.overall_score_max.toFixed(1)} pts</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {r.task_results.map((t, i) => (
                <div key={i} className="bg-white rounded-lg p-3 text-sm">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium capitalize text-gray-800">{t.task_type}</span>
                    <span className="text-green-700 font-semibold">{t.cefr_level}</span>
                  </div>
                  <div className="text-xs text-gray-500">{t.score.toFixed(1)} / {t.max_score} pts</div>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-3">{t.overall_feedback}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

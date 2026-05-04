// ============ 枚举类型 ============

// 场景状态枚举
export type ScenarioStatus = 'draft' | 'published' | 'archived'

// 任务状态枚举
export type TaskStatus = 'not_started' | 'in_progress' | 'completed'

// 任务类型枚举
export type TaskType = 'reading' | 'writing' | 'listening' | 'speaking'

// CEFR等级
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

// ============ 场景相关类型 ============

export interface Scenario {
  id: string
  title: string
  description: string
  instructions?: string
  status: ScenarioStatus
  duration_minutes: number
  total_tasks: number
  tags: string[]
  created_at: string
  updated_at: string
}

// 场景列表响应
export interface ScenarioListResponse {
  items: Scenario[]
  total: number
  page: number
  per_page: number
}

// ============ 任务相关类型 ============

export interface Task {
  id: string
  scenario_id: string
  index: number
  type: TaskType
  title: string
  description: string
  instructions?: string
  time_limit_seconds: number | null
  max_score: number
  has_prompt: boolean
  has_rubric: boolean
}

// Prompt内容段
export interface PromptContent {
  type: 'text' | 'audio' | 'image'
  content: string
  duration_seconds?: number
}

// Prompt响应
export interface PromptResponse {
  id: string
  task_id: string
  content: PromptContent[]
  time_limit_seconds?: number
  max_words?: number
  max_duration_seconds?: number
}

// 评分标准
export interface RubricCriterion {
  name: string
  description: string
  max_score: number
  levels: Record<string, string>
}

// 评分 rubric
export interface RubricResponse {
  id: string
  task_id: string
  criteria: RubricCriterion[]
}

// 任务详细响应
export interface TaskDetailResponse extends Task {
  prompt?: PromptResponse
  rubric?: RubricResponse
}

// ============ 考试尝试相关类型 ============

export interface TaskResponseInfo {
  id: string
  task_id: string
  status: TaskStatus
  started_at?: string
  submitted_at?: string
  response_content?: string // HTML content for writing
  notes_content?: string   // notes for reading
}

export interface Attempt {
  id: string
  student_id: string
  scenario_id: string
  status: 'not_started' | 'in_progress' | 'submitted' | 'scored'
  started_at?: string
  submitted_at?: string
  scored_at?: string
  expires_at?: string
  created_at: string
  updated_at: string
  task_responses: TaskResponseInfo[]
}

// ============ 考试结果相关类型 ============

export interface CompetenceScore {
  competence: 'reading' | 'writing' | 'listening' | 'speaking'
  score: number
  max_score: number
  cefr_level: CEFRLevel
}

export interface DetailedFeedback {
  reading: string
  writing: string
  listening: string
  speaking: string
}

export interface ExamResult {
  id: string
  attempt_id: string
  cefr_level: CEFRLevel
  overall_score: number
  competence_scores: CompetenceScore[]
  detailed_feedback: DetailedFeedback
  generated_at: string
}

// ============ 通用响应类型 ============

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}
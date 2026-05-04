import axios, { AxiosInstance } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器 - 添加认证token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器 - 处理错误
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient

// ============ Authentication APIs ============

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('/login', { email, password }),

  register: (email: string, password: string, full_name: string, role: string) =>
    apiClient.post('/register', { email, password, full_name, role }),

  refresh: (refresh_token: string) =>
    apiClient.post('/auth/refresh', { refresh_token }),

  logout: () =>
    apiClient.post('/auth/logout'),

  me: () =>
    apiClient.get('/users/me'),
}

// ============ Scenario APIs ============

export const scenarioApi = {
  // 获取场景列表
  list: (params?: { page?: number; per_page?: number; status?: string }) =>
    apiClient.get('/teacher/published', { params }),

  // 获取单个场景详情（含tasks）
  get: (scenarioId: string) =>
    apiClient.get(`/teacher/scenarios/${scenarioId}`),

  // 获取场景任务列表
  getTasks: (scenarioId: string) =>
    apiClient.get(`/teacher/scenarios/${scenarioId}/tasks`),

  // 获取任务详情（含prompt）
  getTask: (scenarioId: string, taskIndex: number) =>
    apiClient.get(`/scenarios/${scenarioId}/tasks/${taskIndex}`),

  // 获取任务prompt内容
  getTaskPrompt: (scenarioId: string, taskIndex: number) =>
    apiClient.get(`/scenarios/${scenarioId}/tasks/${taskIndex}/prompt`),
}

// ============ Attempt APIs ============

export const attemptApi = {
  // 创建新的考试尝试
  create: (scenarioId: string) =>
    apiClient.post('/attempts', { scenario_id: scenarioId }),

  // 获取用户的尝试列表
  list: (params?: { user_id?: string; page?: number; per_page?: number; status?: string }) =>
    apiClient.get('/attempts', { params }),

  // 获取尝试详情
  get: (attemptId: string) =>
    apiClient.get(`/attempts/${attemptId}`),

  // 开始/恢复尝试
  start: (attemptId: string) =>
    apiClient.post(`/attempts/${attemptId}/start`),

  // 提交尝试
  submit: (attemptId: string, confirmation: boolean = true) =>
    apiClient.post(`/attempts/${attemptId}/submit`, { confirmation }),

  // 获取时间状态
  getTimeStatus: (attemptId: string) =>
    apiClient.get(`/attempts/${attemptId}/time-status`),

  // 强制完成（admin/超时）
  finalize: (attemptId: string, reason: string) =>
    apiClient.post(`/attempts/${attemptId}/finalize`, { reason }),
}

// ============ Task Response APIs ============

export const taskResponseApi = {
  // 开始任务响应
  start: (attemptId: string, taskId: string) =>
    apiClient.post(`/attempts/${attemptId}/responses`, { task_id: taskId }),

  // 获取尝试的所有任务响应
  list: (attemptId: string) =>
    apiClient.get(`/attempts/${attemptId}/responses`),

  // 获取任务响应详情
  get: (attemptId: string, responseId: string) =>
    apiClient.get(`/attempts/${attemptId}/responses/${responseId}`),

  // 提交任务响应
  submit: (attemptId: string, responseId: string) =>
    apiClient.post(`/attempts/${attemptId}/responses/${responseId}/submit`),

  // 保存任务响应内容（自动保存）
  save: (attemptId: string, responseId: string, content: { content: string }) =>
    apiClient.put(`/attempts/${attemptId}/responses/${responseId}`, content),
}

// ============ User APIs ============

export const userApi = {
  // 获取当前用户信息
  me: () => apiClient.get('/users/me'),

  // 获取用户统计
  stats: () => apiClient.get('/users/me/stats'),

  // 更新用户资料
  update: (data: { full_name?: string; password?: string }) =>
    apiClient.patch('/users/me', data),
}

// ============ Results APIs ============

export const resultApi = {
  // 获取尝试结果
  getAttemptResult: (attemptId: string) =>
    apiClient.get(`/results/attempts/${attemptId}`),

  // 获取我的结果列表
  listMyResults: (params?: { page?: number; per_page?: number }) =>
    apiClient.get('/results/me', { params }),
}
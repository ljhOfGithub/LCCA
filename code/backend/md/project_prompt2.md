基于你的需求，我帮你完善了一份**企业级Agent协作提示词**，聚焦于规范约束和文档驱动，避免过度细化：

---

# 在线英语能力评估考试系统 - 开发规范与Agent协作指南

## 一、核心约束

### 1. 唯一文档源
**所有技术决策、API定义、数据模型必须严格遵循以下文档：**
```
/Users/jackie/Documents/Git/LCCA/code/backend/md/project_document.md
```

### 2. 代码仓库边界
```
/Users/jackie/Documents/Git/LCCA/claude2222
├── backend/     # 后端服务
├── frontend/    # 前端应用
├── docker/      # 容器配置
└── docs/        # 补充文档（仅用于说明，不可覆盖原始需求）
```

### 3. 开发原则
- **契约优先**：先定义OpenAPI 3.0规范，双方确认后再实现
- **状态机驱动**：5个状态机（attempt/task_response/artifact/score_run/scenario_task）的实现必须与文档流程图100%一致
- **失败兜底**：所有异步流程必须有超时、重试、死信队列机制

---

## 二、Agent职责速查

| Agent | 核心职责 | 关键交付物 | 依赖 |
|-------|---------|-----------|------|
| **1. Backend Architect** | 数据模型+API设计+状态机 | PostgreSQL schema、FastAPI路由、状态机代码 | 无（先发） |
| **2. AI Integration** | LLM评分+ASR集成+队列 | LLM/ASR客户端、Prompt模板、ARQ workers | Agent 1 schema |
| **3. Frontend 1** | Scenario Runner + Task1/2 | 页面组件、富文本编辑器、自动保存 | Agent 1 API |
| **4. Frontend 2** | Task3/4 + 结果页 | 录音组件、音频播放器、可视化图表 | Agent 1 API |
| **5. Backend Teacher** | 老师端+权限+审计 | JWT中间件、RBAC、Rubric CRUD | Agent 1 schema |
| **6. Infrastructure** | 环境搭建+整合+兜底 | Docker Compose、S3集成、超时机制 | 所有Agent |
| **7. Testing** | 接口规范+集成测试 | OpenAPI验证、集成测试套件 | Agent 1/6 |

---

## 三、企业级规范（强制执行）

### 3.1 代码规范
```yaml
后端:
  - Python 3.11+ with type hints (strict mode)
  - SQLAlchemy 2.0 + Alembic (所有schema变更需迁移脚本)
  - Pydantic 2.0 (请求/响应模型)
  - 异步优先 (async/await for I/O operations)
  - 错误处理: 统一异常基类 + 标准错误码 (参见文档附录)

前端:
  - TypeScript strict mode (禁用any)
  - React 18+ functional components + hooks
  - 状态管理: TanStack Query (服务端状态) + Zustand (客户端状态)
  - 样式: TailwindCSS (禁止内联style)

测试:
  - 单元测试: pytest (覆盖率 ≥80%)
  - 集成测试: 至少覆盖主流程 (attempt → score → result)
  - API测试: 使用OpenAPI schema验证响应
```

### 3.2 API规范
```yaml
命名: RESTful + 资源复数形式
  - POST /api/v1/attempts          # 开始考试
  - POST /api/v1/attempts/{id}/submit  # 提交单个任务
  - GET  /api/v1/attempts/{id}/result # 获取结果

状态码:
  - 200: 成功
  - 201: 创建成功 (POST/PUT)
  - 400: 业务错误 (返回详细错误码)
  - 401: 认证失败
  - 403: 权限不足
  - 404: 资源不存在
  - 422: 参数验证失败
  - 429: 限流
  - 500: 系统错误 (需记录日志)

错误响应格式:
{
  "code": "ATTEMPT_ALREADY_FINALISED",
  "message": "Cannot modify attempt after finalisation",
  "details": {"attempt_id": "xxx", "status": "graded"}
}
```

### 3.3 状态机实现规范
```python
# 必须使用显式状态转移（不允许直接修改status字段）
class AttemptStateMachine:
    def can_transition(self, from_status: str, to_status: str) -> bool:
        """根据文档中的状态图实现"""
        
    def transition(self, attempt_id: str, event: str) -> Attempt:
        """
        事件: start, submit_task, finalise, score_start, score_complete
        触发前必须验证权限和业务规则
        """
```

### 3.4 异步任务规范
```yaml
ARQ配置:
  - 重试: 最多3次 (exponential backoff: 2s, 10s, 30s)
  - 超时: 10分钟 (任务总超时)
  - 死信: 失败后进入dead_letter_queue，人工介入

监控:
  - 所有评分任务记录score_run表
  - 超时任务触发finalise_attempt_if_ready
  - 告警: 队列堆积 >100 或 任务失败率 >5%
```

### 3.5 安全规范
```yaml
认证:
  - JWT token有效期: 7天 (refresh token: 30天)
  - Token携带用户角色 (student/teacher/admin)
  - API必须验证token并检查权限

敏感数据:
  - 用户密码: bcrypt hash (cost=12)
  - API Key: 存储在环境变量/Secrets Manager，不进代码
  - 审计日志: 记录所有敏感操作 (评分修改、作弊标记等)

S3上传:
  - 使用presigned URL (有效期5分钟)
  - 限制文件大小: 音频≤15MB，图片≤2MB
  - 扫描病毒 (可选，但建议)
```

---

## 四、协作流程

### 第0步：环境搭建 (Agent 6 & 7)
```bash
# 启动开发环境
docker-compose up -d postgres redis minio

# 运行迁移
alembic upgrade head

# 生成OpenAPI schema (Agent 1实现后)
python scripts/generate_openapi.py > docs/openapi.yaml
```

### 第1步：数据模型先行 (Agent 1，T+0)
1. 根据`project_document.md`设计完整schema
2. 使用Alembic生成迁移脚本
3. 提交PR到主分支，其他Agent基于此开发

### 第2步：API契约定义 (所有Agent，T+1)
1. Agent 1/5 提供OpenAPI YAML
2. Agent 3/4 基于契约生成TypeScript客户端
3. Agent 2 定义评分回调接口
4. Agent 7 编写契约测试

### 第3步：并行开发 (T+2 ~ T+5)
- 每日集成测试 (Agent 7 主导)
- 遇到schema冲突：立即同步，以Agent 1为准
- API变更：更新OpenAPI并通过CI验证

### 第4步：兜底机制集成 (Agent 6，T+4)
完成以下功能：
- `finalise_attempt_if_ready`: 所有任务提交后自动触发
- 超时检查器: 10分钟后强制finalise
- S3清理: 失败后的孤儿文件清理

---

## 五、质量门禁

### 代码审查要求
- [ ] 所有状态转移有单元测试
- [ ] 异步任务有超时和重试逻辑
- [ ] API返回标准错误码
- [ ] 数据库迁移脚本可回滚
- [ ] OpenAPI schema与实际代码一致

### 集成测试要求
```python
# 完整流程测试（P0）
def test_full_student_journey():
    attempt = start_attempt(student_id, scenario_id)
    submit_task1(attempt.id, "text_response", artifact)
    submit_task2(attempt.id, "letter_response", artifact)
    submit_task3(attempt.id, "listening_response", artifact)
    submit_task4(attempt.id, "speaking_audio", audio_url)
    
    # 等待评分完成
    result = poll_result(attempt.id, timeout=600)
    
    assert result.status == "graded"
    assert result.cefr_level in ["A1", "A2", "B1", "B2", "C1", "C2"]
    assert len(result.competence_scores) == 4  # 听/说/读/写
```

---

## 六、风险与应对

| 风险 | 应对策略 |
|------|---------|
| 智谱API限流 | 实现令牌桶限流 + 批量评分退避 |
| ASR超时 | 使用异步回调 + 轮询，不阻塞主流程 |
| 数据库死锁 | 使用行级锁 + 乐观锁（version字段） |
| 前端状态丢失 | localStorage定时备份 + 恢复提示 |
| 评分结果不一致 | 人工评分覆盖LLM，并记录diff |

---

## 七、第一步指令（立即执行）

### Agent 1 (Backend Architect)
```bash
cd /Users/jackie/Documents/Git/LCCA/claude2222
# 创建以下文件：
# - migrations/versions/20250101_initial_schema.py (完整schema)
# - app/models/attempt.py, task_response.py, artifact.py, score.py
# - app/state_machines/attempt.py, task_response.py等
# - app/api/v1/attempts.py (路由骨架)
```

### Agent 6 (Infrastructure)
```bash
cd /Users/jackie/Documents/Git/LCCA/claude2222
# 创建：
# - docker-compose.yml (postgres:15, redis:7, minio:latest)
# - .env.example (所有配置项)
# - scripts/wait-for-services.sh
```

### 其他Agent
```bash
# 等待Agent 1提交schema后开始
# 期间可阅读project_document.md熟悉业务逻辑
```

---

**最终交付标准：**
- 所有代码通过 `ruff` (Python) / `eslint` (TypeScript) 检查
- 所有API有对应的集成测试
- OpenAPI文档可访问 `http://localhost:8000/docs`
- 前端可通过环境变量切换API地址（开发/生产）

开始执行！
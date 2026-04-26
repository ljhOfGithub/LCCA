现在我对场景四的四个任务和整个 LCCA 项目有了完整认识，可以给出完整的数据库和 API 设计方案。
                                                                                          ──────────────────────────────
------------------------------------------------------------------------------------------------------------------------------------------------------

  场景四：工作申请 — 数据库 & API 设计                                                                                   
   ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  四个任务回顾
  ┌────────┬────────────────┬──────────────────────────────────────────────────────┐
  │  任务  │      类型      │                       评分标准                       │
  ├────────┼────────────────┼──────────────────────────────────────────────────────┤
  │ Task 1 │ 阅读 + 笔记    │ 阅读理解、笔记质量（Criterion 1-2）                  │
  ├────────┼────────────────┼──────────────────────────────────────────────────────┤
  │ Task 2 │ 写作（申请信） │ 语言、社语言、语用能力（Criterion 3-5）              │
  ├────────┼────────────────┼──────────────────────────────────────────────────────┤
  │ Task 3 │ 听力 + 笔记    │ 口头理解、笔记质量（Criterion 6-7）                  │
  ├────────┼────────────────┼──────────────────────────────────────────────────────┤
  │ Task 4 │ 录音面试       │ 口语语言、社语言、语用互动、流利度（Criterion 8-11） │
  └────────┴────────────────┴──────────────────────────────────────────────────────┘

---

  一、数据库设计

  设计原则

- JSONB 存储可变内容（materials、response data、AI 分析元数据），避免频繁加列
- Versioning 场景/任务可升版本，历史记录不受影响
- 多语言 从一开始支持 language 字段（en/zh）
- 多评分者 同一作答可以有 AI 评分 + 人工评分共存

---

  核心表结构

  -- ─────────────────────────────────────────────
  -- 1. 场景 (Scenarios)
  -- ─────────────────────────────────────────────
  CREATE TABLE scenarios (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      version      INT NOT NULL DEFAULT 1,
      title        TEXT NOT NULL,                   -- "Job Application"
      description  TEXT,
      cefr_level   VARCHAR(3) NOT NULL,             -- A2/B1/B2/C1/C2
      language     VARCHAR(5) NOT NULL DEFAULT 'en',-- en / zh
      domain       TEXT[],                          -- {'professional','social'}
      duration_min INT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'draft',   -- draft/active/retired
      metadata     JSONB,                           -- 扩展字段
      created_at   TIMESTAMPTZ DEFAULT now(),
      UNIQUE (title, version, language)
  );

  -- ─────────────────────────────────────────────
  -- 2. 任务 (Tasks)
  -- ─────────────────────────────────────────────
  CREATE TABLE tasks (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scenario_id     UUID NOT NULL REFERENCES scenarios(id),
      task_number     INT NOT NULL,
      title           TEXT NOT NULL,
      task_type       TEXT NOT NULL,  -- reading/writing/listening/speaking/notetaking
      objective       TEXT,
      duration_min    INT,
      instructions    TEXT,
      UNIQUE (scenario_id, task_number)
  );

  -- ─────────────────────────────────────────────
  -- 3. 素材 (Materials — 文章/音频/视频/提示词)
  -- ─────────────────────────────────────────────
  CREATE TABLE materials (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id       UUID NOT NULL REFERENCES tasks(id),
      material_type TEXT NOT NULL,    -- text/audio/video/prompt/image
      title         TEXT,
      content_text  TEXT,             -- 直接内嵌文本（Task 1 广告文）
      file_url      TEXT,             -- 对象存储 URL（Task 3 音频）
      order_index   INT DEFAULT 0,
      metadata      JSONB             -- 时长、字数、CEFR词汇难度等
  );

  -- ─────────────────────────────────────────────
  -- 4. 评分标准 (Rubrics / Criteria)
  -- ─────────────────────────────────────────────
  CREATE TABLE rubric_criteria (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id          UUID NOT NULL REFERENCES tasks(id),
      criterion_number INT NOT NULL,
      name             TEXT NOT NULL,  -- "Reading Comprehension & Relevance"
      competence_type  TEXT NOT NULL,  -- linguistic/sociolinguistic/pragmatic/fluency/notetaking
      skill_type       TEXT NOT NULL,  -- reading/writing/listening/speaking
      rater_type       TEXT NOT NULL,  -- ai/human/both
      bands            JSONB NOT NULL, -- {1:{desc:"..."}, 2:{...}, 3:{...}, 4:{...}}
      system_focus     TEXT,           -- AI 评分关注点描述
      UNIQUE (task_id, criterion_number)
  );

  -- ─────────────────────────────────────────────
  -- 5. 参考答案 (用于 Task1/3 笔记的 AI 语义比对)
  -- ─────────────────────────────────────────────
  CREATE TABLE reference_answers (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id     UUID NOT NULL REFERENCES tasks(id),
      category    TEXT NOT NULL,   -- qualities/responsibilities/vision/additional_qualities
      item_text   TEXT NOT NULL,   -- "Communicate clearly in English"
      keywords    TEXT[],          -- 语义匹配关键词列表
      weight      NUMERIC DEFAULT 1.0
  );

  -- ─────────────────────────────────────────────
  -- 6. 面试问题 (Task 4)
  -- ─────────────────────────────────────────────
  CREATE TABLE interview_questions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id         UUID NOT NULL REFERENCES tasks(id),
      question_text   TEXT NOT NULL,
      expected_topics TEXT[],
      order_index     INT DEFAULT 0
  );

  -- ─────────────────────────────────────────────
  -- 7. 学生 (Students)
  -- ─────────────────────────────────────────────
  CREATE TABLE students (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      university_id     TEXT UNIQUE NOT NULL,   -- PolyU 学号
      name              TEXT NOT NULL,
      cohort_year       INT,
      programme         TEXT,
      baseline_cefr     VARCHAR(3),
      created_at        TIMESTAMPTZ DEFAULT now()
  );

  -- ─────────────────────────────────────────────
  -- 8. 测试会话 (TestSessions)
  -- ─────────────────────────────────────────────
  CREATE TABLE test_sessions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id      UUID NOT NULL REFERENCES students(id),
      scenario_id     UUID NOT NULL REFERENCES scenarios(id),
      session_type    TEXT NOT NULL DEFAULT 'full', -- full/progress/practice
      status          TEXT NOT NULL DEFAULT 'created', -- created/in_progress/completed/expired
      started_at      TIMESTAMPTZ,
      completed_at    TIMESTAMPTZ,
      expires_at      TIMESTAMPTZ
  );

  -- ─────────────────────────────────────────────
  -- 9. 任务作答 (TaskAttempts)
  -- 使用 JSONB 统一存不同任务类型的作答内容
  -- ─────────────────────────────────────────────
  CREATE TABLE task_attempts (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id       UUID NOT NULL REFERENCES test_sessions(id),
      task_id          UUID NOT NULL REFERENCES tasks(id),
      status           TEXT NOT NULL DEFAULT 'not_started',
                       -- not_started/in_progress/submitted
      response_type    TEXT NOT NULL,
                       -- notes/letter/audio
      response_data    JSONB,
      -- notes:  {"qualities": [...], "responsibilities": [...]}
      -- letter: {"content": "Dear Sir/Madam,..."}
      -- audio:  {"file_url": "...", "asr_transcript": "..."}
      time_spent_sec   INT,
      submitted_at     TIMESTAMPTZ,
      UNIQUE (session_id, task_id)
  );

  -- ─────────────────────────────────────────────
  -- 10. 评分记录 (Scores)
  -- ─────────────────────────────────────────────
  CREATE TABLE scores (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id       UUID NOT NULL REFERENCES task_attempts(id),
      criterion_id     UUID NOT NULL REFERENCES rubric_criteria(id),
      rater_type       TEXT NOT NULL,     -- ai / human
      rater_id         UUID,              -- human rater user_id；AI 为 null
      band_score       INT NOT NULL CHECK (band_score BETWEEN 1 AND 4),
      feedback_text    TEXT,
      ai_metadata      JSONB,             -- 置信度、特征、匹配率等
      scored_at        TIMESTAMPTZ DEFAULT now(),
      UNIQUE (attempt_id, criterion_id, rater_type)
  );

  -- ─────────────────────────────────────────────
  -- 11. 综合结果 (SessionResults)
  -- ─────────────────────────────────────────────
  CREATE TABLE session_results (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id               UUID UNIQUE NOT NULL REFERENCES test_sessions(id),
      overall_band             NUMERIC(3,2),
      cefr_level               VARCHAR(3),
      -- 各能力维度汇总
      competency_breakdown     JSONB,
      -- {"linguistic":3.5, "sociolinguistic":3.0, ...}
      meets_graduation_req     BOOLEAN,
      generated_at             TIMESTAMPTZ DEFAULT now()
  );

---

  ER 关系图（文字版）

  scenarios ──< tasks ──< materials
                     ──< rubric_criteria
                     ──< reference_answers
                     ──< interview_questions

  students ──< test_sessions ──< task_attempts ──< scores
                             ──  session_results

---

  二、API 设计

  以 RESTful 风格，按使用角色分为三组端点。

  2.1 内容管理（Admin / 题库管理）

  GET    /api/v1/scenarios                    # 所有场景列表
  POST   /api/v1/scenarios                    # 创建场景
  GET    /api/v1/scenarios/{scenario_id}      # 场景详情（含任务列表）
  PATCH  /api/v1/scenarios/{scenario_id}      # 更新场景（状态、版本）

  GET    /api/v1/tasks/{task_id}              # 任务详情
  GET    /api/v1/tasks/{task_id}/materials    # 素材列表
  GET    /api/v1/tasks/{task_id}/rubrics      # 评分标准
  GET    /api/v1/tasks/{task_id}/reference-answers  # 参考答案（AI 比对用）
  GET    /api/v1/tasks/{task_id}/interview-questions

  2.2 考试流程（Student — 按任务顺序）

# ── 创建会话 ──

  POST   /api/v1/sessions
  Body:  { "scenario_id": "...", "session_type": "full" }
  Return: { session_id, tasks[], materials_per_task }

# ── 任务操作 ──

  POST   /api/v1/sessions/{session_id}/tasks/{task_id}/start
         → 记录开始时间，返回该任务素材

  PUT    /api/v1/sessions/{session_id}/tasks/{task_id}/draft
  Body:  { "response_data": {...} }   # 自动保存草稿

  POST   /api/v1/sessions/{session_id}/tasks/{task_id}/submit
  Body:  { "response_data": {...} }   # 正式提交，触发 AI 评分

# ── 完成会话 ──

  POST   /api/v1/sessions/{session_id}/complete
         → 汇总结果，写入 session_results

  各任务 response_data 结构示例：

  // Task 1 & 3 (笔记)
  {
    "qualities":         ["Communicate clearly", "Take initiative", ...],
    "responsibilities":  ["Assist in planning projects", ...]
  }

  // Task 2 (写作)
  { "content": "Dear Hiring Manager, I am writing to apply..." }

  // Task 4 (录音)
  { "audio_upload_token": "...",   // 预签名 URL 上传后回写
    "asr_transcript": "..."        // ASR 转写后填入
  }

  2.3 评分与结果

# ── AI 评分 (内部触发，也可手动重跑) ──

  POST   /api/v1/attempts/{attempt_id}/score/ai
         → 异步任务，webhook 回调或轮询

# ── 人工评分 ──

  POST   /api/v1/attempts/{attempt_id}/score/human
  Body:  { "criterion_id": "...", "band_score": 3, "feedback_text": "..." }

  GET    /api/v1/attempts/{attempt_id}/scores  # 所有评分（AI+人工）

# ── 结果报告 ──

  GET    /api/v1/sessions/{session_id}/results
         → overall_band, cefr_level, competency_breakdown, feedback

  GET    /api/v1/students/{student_id}/history
         → 历次 session 列表 + 分数趋势

  GET    /api/v1/students/{student_id}/competency-profile
         → 各 competence × skill 的最新级别

---

  三、对后期整个项目的扩展性保障

  ┌──────────────────────────────┬─────────────────────────────────────────────────────────┐
  │           未来需求           │                        如何支持                         │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 新增场景（其他职业、学术等） │ 直接插入新 scenarios 行，无需改表                       │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 中文语言评测                 │ scenarios.language = 'zh'，其余结构完全复用             │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 不同 CEFR 级别版本           │ scenarios.cefr_level 字段，同一场景可有多版本           │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 新任务类型（如小组讨论）     │ task_type 新枚举值 + response_data JSONB 新结构         │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 人工评分流程                 │ scores.rater_type = 'human' 已预留，不需改表            │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 成绩报告维度变化             │ session_results.competency_breakdown 是 JSONB，随时扩展 │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 任务内容版本迭代             │ scenarios.version + 场景唯一约束，旧会话绑定旧版本      │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 机构层级（多所大学）         │ students 表加 institution_id FK，向上扩展               │
  └──────────────────────────────┴─────────────────────────────────────────────────────────┘

---

  四、技术选型建议

- 数据库：PostgreSQL（JSONB、全文检索、uuid）
- API 框架：FastAPI（Python，方便集成 AI/NLP）或 Node.js + Fastify
- 文件存储：S3 / MinIO（音频、视频）
- ASR：Whisper API 或 Azure Speech（Task 4 转写）
- AI 评分：Claude API（语义理解、写作分析）+ 规则引擎（笔记关键词匹配）
- 异步任务：Celery + Redis 或 BullMQ（AI 评分不阻塞提交接口）

---

  最关键的两个设计决策：response_data JSONB 让所有任务类型共用一张表无需拆表；scores 表 criterion 粒度 让 AI
  与人工评分可以逐维度对比，为后续训练 AI 打基础。要不要我接着设计具体的 AI 评分服务接口或数据库建表脚本？

✻ Churned for 4m 51s

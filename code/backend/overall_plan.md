我来帮你分析这个项目，然后设计一个可扩展的数据库和API架构。首先让我仔细阅读你上传的其他文件，了解场景四的具体内容和整个项目的需求。很好，我已经全面了解了项目内容。让我也快速查看下PPT里的系统架构图，确保理解更完整。现在我对整个项目有了清晰的理解。让我为你设计一个可扩展的数据库和API架构。

在开始之前，我想先确认几个关键的技术选型方向，因为这会影响架构的细节：请你选一下上面这三个问题。不过在等你回答的时候，我先把**不依赖具体技术栈的核心设计思路**给你讲清楚——这部分无论你选哪种技术栈都适用。

---

## 一、先理清楚整个项目要支撑什么

从你上传的材料里，我抽出了未来必须要扩展的能力清单：

 **当前场景 4 需要的** ：4 个 Task 串成一个 Scenario，分别是阅读+笔记、写作信函、听力+笔记、模拟面试录音。每个 Task 有 AI 评分规则和人工评分规则（两套 rubrics），每个 criterion 打 1-4 band，最终映射到 A2/B1/B2/C1+ 的 CEFR 等级。

 **未来一定会加的（从 Design Statement 和会议纪要能看出来）** ：

* 多 Scenario（2-3 个 scenario 串起来做一次完整考试）
* 英文 + 中文两套，中文还可能要 OCR 手写识别
* Practice 模式和 Formal 模式切换
* 教师上传任务（音频、图片、文本多模态）
* AI 评分和人工评分并存，共享同一套 rubric
* Competency Matrix：5 个 domain × 3 个 competence × 6 个 CEFR level 的能力画像
* 个性化 Scenario 推荐（根据学生过往水平）
* 防作弊
* 跟 PolyU 机构系统集成（ITS、SSO）

 **这意味着你的数据模型必须满足三个核心原则** ：scenario/task 要做成"模板-实例"分离；rubric 要跟 task 解耦；评分结果要能同时承载 AI 和人工两种来源。

---

## 二、数据库设计：分 6 个域

我建议把数据库按职责分成 6 个模块。下面这张图把它们的关系画出来：下面我把每个域的核心表和关键字段给你讲清楚。先讲为什么这样设计，再给表结构。

---

## 三、核心表设计（带设计理由）

### 域 ② 能力矩阵 —— 最关键的"知识骨架"

你上传的 Competency Matrix 是 **5 domains × 3 competences × 6 CEFR levels** 的三维结构。如果把它硬编码，以后加一个 domain 或者新增一个 level（比如分 B2.1/B2.2）就要改代码。所以用三张"字典表 + 一张描述符表"：

```sql
-- 五大域：social-interpersonal / transactional / persuasive / academic / professional
competency_domains (
  id              uuid PK,
  code            varchar UNIQUE,   -- 'SOCIAL_INTERPERSONAL'
  name_en         varchar,
  name_zh         varchar,
  description     text,
  display_order   int
)

-- 三种能力：linguistic / sociolinguistic / pragmatic
competences (
  id              uuid PK,
  code            varchar UNIQUE,
  name_en         varchar,
  name_zh         varchar,
  description     text
)

-- CEFR 等级字典
cefr_levels (
  id              uuid PK,
  code            varchar UNIQUE,   -- 'A2','B1','B2','C1','C2'
  ordinal         int,              -- 排序用，以后加 B2.1 也能插进去
  name            varchar
)

-- 矩阵单元格：每个 domain × competence × level 的描述符
competency_descriptors (
  id              uuid PK,
  domain_id       uuid FK,
  competence_id   uuid FK,
  level_id        uuid FK,
  descriptor_text text,             -- "Demonstrates strong and generally reliable control..."
  source          varchar,          -- 'CEFR' | 'POLYU_CUSTOM'
  version         int,
  UNIQUE(domain_id, competence_id, level_id, version)
)
```

为什么要 `version` 字段？你的 Design Statement 明确说矩阵会不断修订。用版本化之后，老的考试记录依然能查到当时用的是哪一版描述符——这是高利害考试（high-stakes）必须的可追溯性。

### 域 ③ 内容库 —— "模板-实例分离"是核心

场景四让我看明白一件事：一个 Scenario（比如 Job Application）下面有 4 个 Task，每个 Task 有自己的输入内容（广告文本、录音脚本）和指令。 **这些内容在不同学生的考试里应该是同一份内容的同一个版本** ，但每个学生的作答是独立的。

所以把"任务模板"和"考试实例"彻底分开：

```sql
-- 场景模板
scenarios (
  id                  uuid PK,
  code                varchar UNIQUE,     -- 'JOB_APPLICATION_V2'
  title_en            varchar,
  title_zh            varchar,
  cefr_target_level   uuid FK,            -- B2
  language            varchar,            -- 'en' | 'zh'
  domains_covered     uuid[],             -- 跨多个 domain
  estimated_minutes   int,
  status              varchar,            -- draft/review/published/retired
  version             int,
  created_by          uuid FK,
  published_at        timestamptz
)

-- 任务模板（一个 scenario 有多个 task）
tasks (
  id                  uuid PK,
  scenario_id         uuid FK,
  sequence            int,                -- 1,2,3,4
  task_type           varchar,            -- reading / writing / listening / speaking / notetaking
  title               varchar,
  instructions        text,
  time_limit_seconds  int,
  input_payload       jsonb,              -- 题目的结构化内容（见下）
  response_schema     jsonb,              -- 期望答案结构（文本 / 音频 / 笔记）
  config              jsonb,              -- {allow_revision: true, word_limit: 300, ...}
  version             int
)

-- 任务引用的媒体资源（录音、图片等）
task_assets (
  id                  uuid PK,
  task_id             uuid FK,
  asset_type          varchar,            -- audio/image/video/document
  storage_key         varchar,            -- S3/OSS 路径
  mime_type           varchar,
  duration_ms         int,                -- 音频/视频时长
  transcript          text,               -- Task 3 的 tape script
  metadata            jsonb
)

-- 任务绑定的评分标准（多对多）
task_rubric_bindings (
  task_id             uuid FK,
  rubric_id           uuid FK,
  weight              decimal,
  PRIMARY KEY (task_id, rubric_id)
)
```

**关键设计：`input_payload` 和 `response_schema` 用 JSONB。** 因为场景四 Task 1 是"读广告+做笔记"，Task 4 是"录音面试"——它们的输入结构完全不同。用 JSONB 存，以后加一个"拖拽排序"题型也不用动表结构。比如：

```jsonc
// Task 1 的 input_payload
{
  "type": "reading_with_notetaking",
  "passages": [{"heading": "BrightWave Urban Solutions...", "body": "..."}],
  "notetaking_prompts": [
    {"id": "qualities", "label": "3-5 qualities", "min_items": 3, "max_items": 5},
    {"id": "responsibilities", "label": "3 key responsibilities", "min_items": 3, "max_items": 3}
  ]
}

// Task 4 的 input_payload  
{
  "type": "oral_interview",
  "interlocutor_prompts": [
    {"turn": 1, "question_text": "Tell me why you chose BrightWave.", "audio_key": "..."},
    {"turn": 2, "question_text": "...", "follow_up_strategy": "probe_for_examples"}
  ]
}
```

### 域 ② 评分标准（Rubrics）—— 让 AI 和人工共享一套

你的两份 rubric 文件（AI Use 和 Human Rater Use）其实描述的是 **同一套 criteria 和同样的 4 个 band** ，只是描述语言不同。所以设计成：

```sql
rubrics (
  id              uuid PK,
  code            varchar UNIQUE,     -- 'SCENARIO4_TASK2_WRITING'
  title           varchar,
  version         int,
  status          varchar,            -- draft/active/deprecated
  applicable_level_ids uuid[]         -- 目标 CEFR 等级
)

rubric_criteria (
  id                 uuid PK,
  rubric_id          uuid FK,
  sequence           int,
  code               varchar,         -- 'LINGUISTIC_WRITTEN'
  name               varchar,         -- 'Linguistic Competence (Written)'
  competence_id      uuid FK,         -- 对应到三大 competence 之一
  domain_id          uuid FK NULLABLE,
  weight             decimal,
  system_focus       text,            -- AI 的技术关注点
  human_focus        text             -- 人工评分者的关注点
)

rubric_band_descriptors (
  id              uuid PK,
  criterion_id    uuid FK,
  band            int,                -- 1 / 2 / 3 / 4
  level_mapping   uuid FK,            -- band 3 → B2
  ai_descriptor   text,               -- AI use 版描述
  human_descriptor text                -- Human rater 版描述
)
```

一条 criterion 底下四个 band 各自有一条 AI descriptor + 一条 Human descriptor， **两者共享 band 号** ——这样 AI 评分为 3、人工评分为 3，可以直接在一个报表里对齐比较（训练 AI 评分用的就是这种配对数据）。

### 域 ④ 考试会话 —— 区分"这次考试是什么"和"学生答了什么"

```sql
-- 某个学生在某个 scenario 上的一次完整尝试
attempts (
  id                      uuid PK,
  user_id                 uuid FK,
  scenario_id             uuid FK,
  scenario_version        int,              -- 快照当时的版本
  mode                    varchar,          -- 'practice' | 'formal' | 'mock'
  started_at              timestamptz,
  submitted_at            timestamptz,
  expires_at              timestamptz,      -- 基于 time limit 的死线
  status                  varchar,          -- in_progress/submitted/graded/invalidated
  proctoring_session_id   uuid FK NULLABLE,
  client_metadata         jsonb             -- 浏览器、网络、设备信息
)

-- 每个 task 的作答（一个 attempt 产生多条）
task_responses (
  id                      uuid PK,
  attempt_id              uuid FK,
  task_id                 uuid FK,
  task_version            int,              -- 快照
  started_at              timestamptz,
  submitted_at            timestamptz,
  time_spent_seconds      int,
  response_content        jsonb,            -- 结构化作答（见下）
  derived_analysis        jsonb,            -- ASR 转写、分词、统计特征
  status                  varchar
)

-- 生文件（录音、笔记图片等）单独一张表
response_artifacts (
  id              uuid PK,
  response_id     uuid FK,
  artifact_type   varchar,              -- 'audio_recording' | 'transcript' | 'notes_image'
  storage_key     varchar,
  mime_type       varchar,
  duration_ms     int,
  checksum        varchar               -- 防篡改
)
```

**关键：`scenario_version` 和 `task_version` 是快照字段，而不是外键到版本表。** 为什么？因为如果一个 scenario 被修订后，你要能精确知道某个学生当时做的是哪个版本；如果只靠 `scenario_id`，后期改了题你就分不清了。

`response_content` 存结构化作答：

```jsonc
// Task 1 笔记
{
  "type": "notetaking",
  "sections": {
    "qualities": ["clear communication", "teamwork", "initiative", "time management"],
    "responsibilities": ["prepare project timelines", "take meeting notes", "collect info"]
  },
  "position_chosen": "project_consultant"
}

// Task 2 写作
{
  "type": "essay",
  "text": "Dear Hiring Manager, ...",
  "word_count": 287,
  "revision_history": [{"ts": "...", "snapshot": "..."}]
}

// Task 4 面试（录音文件在 response_artifacts，转写在这里）
{
  "type": "oral_interview",
  "turns": [
    {"turn": 1, "asr_transcript": "Well, I chose BrightWave because...", "confidence": 0.94}
  ]
}
```

### 域 ⑤ 评分与结果 —— AI 和人工用同一张表

这是整个系统最容易设计错的地方。最佳做法： **打分记录表不区分 AI/人工，靠 `rater_type` 字段区分** 。

```sql
-- 一次完整的评分（可以有多次：AI 评一次，人工评一次）
score_runs (
  id                  uuid PK,
  response_id         uuid FK,          -- 对哪条作答
  rubric_id           uuid FK,          -- 用哪套标准
  rubric_version      int,
  rater_type          varchar,          -- 'ai' | 'human'
  rater_id            uuid,             -- AI model id 或 user id
  model_name          varchar NULLABLE, -- 'gpt-4o' / 'claude-opus-4.7'
  model_version       varchar NULLABLE,
  overall_band        decimal,          -- 聚合后的 band（可小数）
  mapped_cefr_level   uuid FK,          -- 对到 CEFR 等级
  status              varchar,          -- pending/completed/challenged
  confidence          decimal NULLABLE,
  created_at          timestamptz,
  completed_at        timestamptz
)

-- 每个 criterion 的具体评分
score_details (
  id              uuid PK,
  score_run_id    uuid FK,
  criterion_id    uuid FK,
  band            int,                  -- 1-4
  rationale       text,                 -- AI 给出的理由或人工评语
  evidence_refs   jsonb,                -- AI 引用的作答片段（start/end 位置）
  flags           varchar[]             -- ['off_topic', 'plagiarism_suspect']
)

-- 每次考试的最终聚合结果（对学生可见的那份）
attempt_results (
  id                  uuid PK,
  attempt_id          uuid FK UNIQUE,
  overall_cefr_level  uuid FK,
  competency_profile  jsonb,            -- 5 domain × 3 competence 的画像
  pass_fail           boolean NULLABLE,
  report_generated_at timestamptz,
  released_at         timestamptz,      -- 给学生看的时间
  is_challengeable    boolean
)
```

为什么要 `attempt_results.competency_profile` 用 JSONB 存？因为它本质是个 **画像对象** ——5 domain × 3 competence 的 15 个单元格，每个单元格有个 level。这个形态非常稳定但内容经常要加（比如以后加"fluency 分项"），放 JSONB 最合适，不要拆成 15 行关系表。

### 域 ① 身份 与 域 ⑥ 附件和审计

身份就是标准的 RBAC 骨架：

```sql
users (id, external_id, email, name, locale, role_scopes jsonb, status, ...)
student_profiles (user_id FK, student_number, program, admission_year, current_cefr_level_id)
cohorts (id, code, admission_year, ...)  -- 方便按届次管理
user_cohorts (user_id, cohort_id)
```

附件和审计：

```sql
assets (id, storage_key, mime_type, size_bytes, checksum, created_by, created_at, ...)
audit_events (id, actor_id, entity_type, entity_id, action, before jsonb, after jsonb, created_at)
proctoring_events (id, attempt_id, event_type, payload jsonb, risk_score, timestamp)
```

 **audit_events 是高利害考试的生命线** ——任何对 scenario、rubric、score 的改动都要记录，谁改的、什么时候改的、改了什么。未来如果学生申诉成绩，这就是你的证据。

---

## 四、API 设计：按"角色 × 资源"组织

现在看 API。我建议用 RESTful + 语义化动作端点混合的风格。分 5 组：

### 1. 身份 & 元数据

```
POST   /api/v1/auth/sso/callback               PolyU SSO 回调
GET    /api/v1/me                              当前用户信息
GET    /api/v1/competency-matrix                获取完整矩阵（带 descriptor）
GET    /api/v1/competency-matrix/versions       历史版本列表
```

### 2. 教师侧：内容创作（对应会议纪要里 Alan 提的"teachers can upload tasks"）

```
# 场景 CRUD
POST   /api/v1/scenarios                       创建场景草稿
GET    /api/v1/scenarios                       列表 + 过滤(level, language, status)
GET    /api/v1/scenarios/{id}
PATCH  /api/v1/scenarios/{id}                  编辑（只 draft 可以）
POST   /api/v1/scenarios/{id}:publish          发布（生成版本号 + 冻结）
POST   /api/v1/scenarios/{id}:clone            克隆为新草稿

# 任务
POST   /api/v1/scenarios/{id}/tasks
PATCH  /api/v1/tasks/{id}
POST   /api/v1/tasks/{id}/assets                上传音频/图片（返回 upload URL）
POST   /api/v1/tasks/{id}:preview               生成预览（学生视角）

# 评分标准
POST   /api/v1/rubrics
GET    /api/v1/rubrics?criterion_code=...
POST   /api/v1/rubrics/{id}/criteria
POST   /api/v1/rubrics/{id}:publish
POST   /api/v1/tasks/{id}/rubric-bindings       关联 rubric 到 task
```

 **设计要点** ：把"发布"做成动词端点（`:publish`）而不是 `PATCH status=published`——因为发布是一个 **不可逆副作用** （生成版本快照、冻结内容），不该混在普通字段更新里。这是 Google API Design Guide 的标准做法。

### 3. 学生侧：考试流程

这里最重要的是 **把"开始考试"和"提交作答"分开** ，并且作答要支持 **断点续答** （学生网络断了怎么办？）。

```
# 可选场景列表（基于学生当前等级做个性化推荐）
GET    /api/v1/me/available-scenarios?mode=practice

# 开始一次尝试
POST   /api/v1/attempts
       body: { scenario_id, mode: "practice"|"formal" }
       返回: { attempt_id, tasks: [...], expires_at }

# 获取某个 task 的完整数据（包含 asset 的签名 URL）
GET    /api/v1/attempts/{aid}/tasks/{tid}

# 保存中间作答（每 30 秒自动保存）
PUT    /api/v1/attempts/{aid}/tasks/{tid}/response
       body: { response_content: {...} }

# 上传录音/笔记图片
POST   /api/v1/attempts/{aid}/tasks/{tid}/artifacts:upload-url
       返回预签名上传 URL

# 提交单个 task（锁定）
POST   /api/v1/attempts/{aid}/tasks/{tid}:submit

# 提交整个 attempt（触发评分）
POST   /api/v1/attempts/{aid}:submit

# 查看结果（released 之后才返回）
GET    /api/v1/attempts/{aid}/result
```

 **关键设计：`PUT .../response`  用 PUT 不是 POST** ，因为它是幂等的——学生输入的同一份草稿多次保存应该产生同样的结果。这样前端可以放心做防抖+自动保存。

 **文件上传走预签名 URL** ，不要让录音文件走你的 API 服务器——录音几十 MB，直接走对象存储（S3/OSS）。API 只负责给一个临时有效的 upload URL，学生浏览器直接 PUT 到对象存储。

### 4. 评分（内部 + 人工评分员）

```
# 评分队列触发（内部消费）
POST   /api/v1/internal/score-runs            
       body: { response_id, rubric_id, rater_type: "ai", model: "..." }

# 人工评分员 workbench
GET    /api/v1/rater/assignments?status=pending
GET    /api/v1/rater/assignments/{id}           拿到作答 + rubric
POST   /api/v1/rater/assignments/{id}:submit    提交评分

# AI 评分回调
POST   /api/v1/internal/score-runs/{id}:complete
       body: { score_details: [...], overall_band, confidence }

# 结果生成
POST   /api/v1/internal/attempts/{id}:finalize  聚合所有 score_runs 生成 result
```

 **把 AI 评分设计成异步任务** ，用 `score_runs.status` 做状态机：`pending → in_progress → completed/failed`。这样：

* 学生提交后立刻返回"已提交，正在评分"
* 评分任务由后台 worker 取队列执行（LLM 调用慢，5-30 秒）
* 评分完成后触发 `finalize` 生成最终结果

### 5. 管理 & 报表

```
GET    /api/v1/admin/reports/cohorts/{id}/competency-distribution
GET    /api/v1/admin/reports/scenarios/{id}/task-analytics  
POST   /api/v1/admin/calibration-runs           人机评分一致性分析
GET    /api/v1/admin/audit-events?entity=scenario&id=...
```

---

## 五、几个重点要记住的扩展性原则

**1. 一切内容都要版本化。** scenario、task、rubric、descriptor 都加 `version` 字段，published 版本不可改，要改先 clone 成 draft。学生的 attempt 快照当时的 version。这是高利害考试的合规底线。

**2. 所有耗时的 AI 调用走队列。** 不要在 HTTP 请求里直接调 LLM——LLM 响应慢、会失败、要重试。用一个 `score_jobs` 队列表 + 后台 worker，学生不用等。

**3. 媒体文件走对象存储，不走数据库。** 数据库只存 `storage_key`。录音 10MB 一个，一年考 1 万人次 × 4 个 task = 400GB，用对象存储成本只是数据库的零头。

**4. JSONB 是你的朋友，但不要滥用。** 用在题目内容、作答内容、配置参数这些"形态多变但不用聚合查询"的地方。但 CEFR level、band、status 这种要做聚合统计的字段，坚决拆出来建索引。

**5. 读写分离留口子。** 学生考试是写密集（每 30 秒保存一次），教师/管理员看报表是读密集。现在不用做读写分离，但表设计时要让 `attempt_results` 这种报表查询不用 JOIN 超过 3 张表——如果发现必须 JOIN 很多才能出报表，就加物化视图。

**6. 中英双语的策略：不要分两套表，而是给关键字段加 `_en/_zh` 后缀，或者用 `language` 字段 + 两条记录。** 对于 scenario/task 建议用后者（两条记录 + `parallel_group_id` 关联），因为中英题目的内容通常不是直接翻译，是各自独立设计的。

---

你回答前面那三个问题之后，我可以继续帮你：

* 生成完整的 PostgreSQL DDL 脚本（建表 + 索引 + 约束）
* 写 OpenAPI 3.0 规范文件
* 画一张完整的 ERD 图
* 或者针对场景四直接写一个 FastAPI/NestJS 的 MVP 脚手架

你想先看哪个？

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
  published_at        timestamptz,
  is_available        boolean
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
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
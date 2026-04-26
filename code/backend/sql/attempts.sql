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
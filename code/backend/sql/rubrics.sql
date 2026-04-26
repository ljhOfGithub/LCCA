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
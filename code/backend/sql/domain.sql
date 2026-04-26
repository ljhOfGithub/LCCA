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
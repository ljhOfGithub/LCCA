# 项目概述
我们需要开发一个**在线英语能力评估考试系统**，支持学生参加多任务考试（阅读、写作、听力、口语），并自动/人工评分。

## 项目规模
- 后端：FastAPI + PostgreSQL + Redis + ARQ Worker
- 存储：S3/对象存储
- 外部服务：LLM API（评分）、ASR（语音转文字）
- 前端：老师端 + 学生端

## 团队分工要求

### Agent 1: Backend Architect - 数据模型与API设计
负责实现以下实体和API：
- 实体：`attempt`、`task_response`、`response_artifact`、`score_run`、`score_detail`、`attempt_result`
- 状态机：实现文档中的5个状态机（attempt、task_response、artifact、score_run、scenario/task）
- API列表：
  - 考试流程API（/attempt/start, /attempt/{aid}/task/{tid}/submit等）
  - 评分API（/score-run/submit, /rater/human/*）
  
**交付物**：
- PostgreSQL schema（含所有实体表）
- FastAPI路由骨架
- 状态机实现代码

### Agent 2: AI Integration Specialist - 评分与ASR集成
负责实现：
- LLM评分集成（task 1/2/3）
- ASR服务集成（task 4）
- Prompt模板系统（`prompt_template`表）
- 重试机制（文档中的评分重试机制）
- 并发评分队列（ARQ workers）

**交付物**：
- LLM客户端封装（支持超时、重试）
- ASR客户端
- Prompt模板管理
- 评分工作流（`score_response`任务）

### Agent 3: Frontend Developer - 学生端1
负责实现学生端的以下页面：
- Scenario列表页
- Scenario Runner主页面（含左侧进度条、倒计时）
- Task 1（阅读+笔记）：左栏广告全文，右栏笔记区
- Task 2（求职信）：左栏参考资料（Tab切换），右栏富文本编辑器
- 自动保存功能（每30秒）

**交付物**：
- React组件
- API客户端集成
- 富文本编辑器集成
- WebSocket/轮询实现

### Agent 4: Frontend Developer - 学生端2
负责实现学生端的以下页面：
- Task 3（听力+笔记）：音频播放器（无暂停、1次重听）+笔记区
- Task 4（面试录音）：串行4个问题 + 录音组件（3分钟限制）
- 提交确认页面
- 等待评分页面（进度轮询）
- Result报告页（CEFR等级 + Competence矩阵 + 详细反馈）

**交付物**：
- 录音组件（含波形可视化）
- 音频播放器（定制控制）
- 结果可视化（雷达图/热力图）
- 轮询逻辑

### Agent 5: Backend Developer - 老师端与权限
负责实现：
- 用户认证系统（user/student/teacher表）
- 老师端API：
  - Rubric管理（创建/编辑）
  - Criterion管理
  - Scenario/Task/Material管理
  - 人工评分工作流（获取待评任务、提交评分）
- 审计日志（audit_event）
- 作弊检测（proctoring_event）

**交付物**：
- JWT认证中间件
- RBAC权限控制
- Rubric CRUD API
- 人工评分界面后端

### Agent 6: Infrastructure & Integration Lead
负责：
- 定义各模块间的接口规范
- 配置开发环境（Docker Compose）
- 实现finalise_attempt_if_ready兜底机制
- 整合S3 presigned URL上传流程
- 实现超时兜底（10分钟）

### Agent 7: Testing Engineer
负责：
- 定义各模块间的接口规范
- 配置开发环境（Docker Compose）
- 实现finalise_attempt_if_ready兜底机制
- 整合S3 presigned URL上传流程
- 实现超时兜底（10分钟）

**交付物**：
- docker-compose.yml（PostgreSQL+Redis+MinIO）
- 集成测试
- 部署文档

## 协作要求

1. **数据库schema统一**：Agent 1 提供权威schema，其他Agent基于此开发
2. **API契约优先**：所有API需先定义OpenAPI spec，再实现
3. **状态机一致性**：严格按照文档中的5个状态图实现
4. **错误处理**：实现文档中的重试、超时、兜底机制
5. **进度同步**：每日同步集成进度

## 约束条件

- 评分超时：10分钟总超时
- ASR重试：最多3次
- 音频限制：最长3分钟
- 自动保存：每30秒
- 并发：ARQ worker支持并发评分
- 只在 /Users/jackie/Documents/Git/LCCA/code/claude 中开始任务

## 优先级

**P0（核心流程）**：
1. Attempt创建和提交流程
2. LLM评分（task 1/2/3）
3. ASR转写 + LLM评分（task 4）
4. Result聚合

**P1（老师工具）**：
5. Rubric管理
6. 人工评分界面

**P2（监控与审计）**：
7. 作弊检测
8. 审计日志

## 技术栈建议

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.0 / Alembic
- 队列：ARQ (Redis Queue)
- LLM：OpenAI/Anthropic API（支持MiniMax/智谱适配）
- ASR：Azure Speech / Whisper API
- 存储：boto3 (S3兼容)
- 前端：React 18 / TypeScript / TailwindCSS / TipTap（富文本）/ RecordRTC（录音）

## 第一步行动

请各Agent：
1. Agent 1：立即设计完整的PostgreSQL schema并提交
2. Agent 6：搭建Docker开发环境
3. 其他Agent：等待schema后开始实现

开始工作！
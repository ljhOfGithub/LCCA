## 实体

### 核心能力实体

- Social-interpersonal等评分领域 domain/aspect
- Linguistic等评分能力 competence
- cfer语言评分等级 level
- 矩阵单元格 competence matrix

### 评分标准实体

- 评分体系 rubric
- 评分细则 rubric_criteria
- 评分描述（字段包含中文描述、英文描述）rubric_band_descriptor

### 场景实体

- 场景 scenario
- 场景任务 task
- 材料（资源） material
- 任务对应材料的关联表 task_material
- 任务对应rubric的关联表 task_rubric

### 考试会话实体

- 单次考试尝试 attempt
- 单次尝试单个任务的作答（响应） task_response
- 单个作答产生的文件 response_artifact

### 评分结果实体

- 单个评分（使用rater type区分人工和AI）
- 单个评分中，对应单个评分标准criteria的细节
- 最终评分结果

### 角色权限控制系统实体

- 用户
- 角色
- 用户角色关联表
- 许可
- 学生
- 老师

### 反馈模块实体

- 反馈
- 作弊检测记录

## 实体属性

### 核心能力实体

- Social-interpersonal等评分领域 domain/aspect
  - 编码
  - 名字
  - 描述
  - 是否启用
- Linguistic等评分能力 competence
  - 编码
  - 名字
  - 描述
  - 是否启用
- cefr语言评分等级 level
  - 名字
  - 描述
  - 是否启用
  - 顺序
- competence matrix 矩阵单元格
  - domain
  - competence
  - cefr
  - description
  - 是否启用
  - 版本
  - 来源（自订还是全球标准）

### 评分标准实体

- 评分体系 rubric
  - 编码 {ScenarioName_TaskNumber_TaskName}
  - name
  - version
  - is_available
- 评分细则 rubric_criteria
  - rubric_id
  - 编码
  - title
  - 描述
  - domain_id
  - competence_id
- rubric_band_descriptor 评分描述（字段包含中文描述、英文描述）
  - rubric_creteria_id
  - 等级band（1-4）
  - description_ai
  - description_human
  - cefr_level_id

### 场景实体

- 场景 scenario
  - 编码
  - t语言
  - is_available
  - 描述
  - cefr_target_level
  - version
- 场景任务 task
  - scenario_id
  - 顺序
  - ti
  - time_limit(milliseconds)
  - task_type(number)
  - instruction
  - input_payload(jsonb)
  - response_schema(jsonb)
  - config(jsonb)
  - version
- 材料（资源） material
  - name
  - material_type(including prompt)
  - mime_type
  - storage_key
  - duration_ms
  - transcript
  - metadata
- 任务对应材料的关联表 task_material
  - tid
  - material_id
- 任务对应rubric的关联表 task_rubric
  - tid
  - rubric_id
  - weight

### 考试会话实体

- 单次考试尝试 attempt
  - user_id
  - scenario_id
  - scenario_version
  - mode(pratice|formal)
  - started_at
  - submitted_at
  - expired_at
  - status(enum number)
  - client_metadata(jsonb)
    - browser
    - network
    - device
- 单次尝试单个任务的作答（响应） task_response
  - aid
  - tid
  - task_version
  - started_at
  - submitted_at
  - expired_at
  - response_payload
  - asr_metadata
  - status(enum nubmer)
- 单个作答产生的文件 response_artifact
  - response_id
  - artifact_type
  - storage_key
  - mime_type

### 评分结果实体

- 单个评分 score_run（使用rater type区分人工和AI）
  - response_id
  - rubric_id
  - rubric_version
  - status(enum number)
  - overall_cefr_level
  - overall_band
  - completed_at
- 单个评分中，对应单个评分标准criteria的细节 score_detail
  - score_run_id
  - criteria_id
  - model_name
  - model_temperature
  - model_metadata
  - model_response
  - rater_type
  - rater_id
  - band(1-4)
  - completed_at
  - status(enum number)
  - mapped_cefr_level
- 最终评分结果 attempt_result
  - aid
  - score_run_id
  - overall_cefr_level
  - overall_band
  - pass_fail
  - competence_profile(jsonb)
  - generated_at
    note: overall_cefr_level, overall_band 出现两次，表示初步结果和最终发布结果（人工矫正）

## 其他机制
### 多语言
- 多语言文件
### 评分重试机制
等待并完成
- 成功路径
所有 task 都成功
- 超时兜底
保证不会无限等待，从提交 attempt 开始评分起，超时十分钟则放弃，并且全部使用人工重评
- 重试次数
累计检查 N 次还没成功就放弃
- 提前完成
如果所有的评分 score run 都进入终态，completed 或者 failed，则不再等待，将 failed 的部分使用人工重评
- 网络兜底
如果每个 score run 都完成，但是出现网络故障，导致无法 finalize attempt，则 finalise_attempt_if_ready 负责兜底

## API 设计

### 评分标准 rubric API

GET /api/v1/rubric-list
POST /api/v1/rubric/create
POST /api/v1/rubric/{id}/edit
GET /api/v1/rubric/{id}

### 评分标准细则 criterion API

POST /api/v1/rubric/criterion/create
POST /api/v1/rubric/criterion/{id}/edit

### 场景实体 scenario API

GET /api/v1/scenario-list
POST /api/v1/scanario/create
POST /api/v1/scenario/{id}/edit
GET /api/v1/scenario/{id}

### 场景任务实体 task API

GET /api/v1/task-list
POST /api/v1/task/create
POST /api/v1/task/{id}/edit
GET /api/v1/task/{id}

### 材料 material API

GET /api/v1/material-list
POST /api/v1/material/create
POST /api/v1/material/{id}/edit
GET /api/v1/material/{id}

### 考试流程 API

- 学生获取可选的场景
  GET /api/v1/available-scenario-list
- 学生开始作答
  POST /api/v1/attempt/start
- 学生获取作答细节
  GET /api/v1/attempt/{aid}/task/{tid}
- 自动保存学生中间回答
  POST /api/v1/attempt/{aid}/task/{tid}/response/save
- 学生上传文件
  POST /api/v1/attempt/{aid}/task/{tid}/artifact/upload
- 学生修改文件
  POST /api/v1/artifact/{aid}/update
- 学生提交单个 task
  POST /api/v1/attempt/{aid}/task/{tid}/response/submit
- 学生提交整个 attempt
  POST /api/v1/attempt/{aid}/response/submit
- 学生查看结果
  GET /api/v1/attempt/{aid}/result

### 评分 score_run API

GET /api/v1/score-run-list

- 触发评分
  POST /api/v1/score-run/submit
- 人工评分员获取待评价任务
  GET /api/v1/rater/human/attempt-list
- 人工评分员获取作答和 rubric
  GET /api/v1/rater/human/attempt/{aid}
- 人工评分员提交评分
  POST /api/v1/rater/human/attempt/{aid}/submit
- 人工评分员获取评分
  GET /api/v1/rater/human/attempt/{aid}/score
- 人工评分员获取结果
  GET /api/v1/rater/human/attempt/{aid}/result
- 人工评分员获取学生的历史记录
  GET /api/v1/student/{sid}/history
- 人工评分员获取学生的competence
  GET /api/v1/student/{sid}/competency-profile

## 系统交互图

```mermaid

```

- 主体：
student - s
fastapi backend - be
postgresql - pq
object storage - s3
redis + arq worker - q
llm api - llm 
asr service - asr

- 流程：
  - 阶段1 start attempt
    - s -> be: POST  attempt/start
    - be -> pq: insert attempt + 4 reponse
    - pq -> be: attempt_id
    - be -> student: attempt_id + expired_at
    - student -> be: GET attempt/{aid}
    - be -> pq: load scenario + task + material
    - pq -> s3: presigned URL for materials
    - s3 -> be: presigned URLs
    - be -> s: full scenario + task list
  - phase2: text task(1 2 3) autosave(loop)
    - s -> be: POST /attempt/{aid}/task/{tid}/response
    - be -> pq: update response
    - pq -> be: return ok
    - be -> s: auto save
    - s -> be: POST /attempt/{aid}/task/{tid}/submit
    - be -> pq: transform response status
    - be -> s: return ok
  - phase3: task4 audio upload
    - s -> be: POST /attempt/{aid}/task/{tid}/artifact/upload
    - be -> pq: generate key + insert response artifact
    - be -> s3: generate presigned PUT URL
    - s3 -> be: signed URL
    - be -> s: upload_url + artifact_id
    - s -> s3: PUT bytes(webm audio)
    - s3 -> s: return 200
    - s -> be: POST /artifact/{aid}/update
    - be -> pq: update artifact metadata
    - be -> s: return 200
  - phase 4: 
    - s -> be: POST attempt/{aid}/submit
    - be -> pq: transform attempt.status
    - pq -> q: enqueue socre_response * N
    - pq -> q: enqueue finalise_attempt_if_ready
    - be -> s: return 200; grading started
  - phase 5: grading parallel
    - task 1|2|3
      - q -> pq: load response + rubric
      - q -> llm: build prompt + request score
      - llm -> q: criterion band + model_response
      - q -> pq: insert score_run + score_detail
    - task 4
      - q -> s3: download request
      - s3 -> q: audio file
      - q -> asr: request audio to text
      - asr -> q: text + word timing
      - q -> pq: store task_response.asr_metadata
      - q -> llm: build prompt + request score
      - llm -> q: criterion band + model_response
      - q -> pq: insert score_run + score_detail
    - phase 6: finalise attempt
      - q -> pq: check all score_run completed/failed
      - q -> pq: aggregate competence profile
      - q -> pq: insert attempt_result, transform attempt status
    - phase 7: student poll for result
      - s -> be: GET /attempt/{aid}/result
      - alt: result not ready
        - be -> s: result not ready
      - else
        - be -> pq: load attempt_result
        - be -> s: full report(attempt_result, overall_cefr_level)
### 学生端

## 页面总体设计

### 老师端（demo 阶段不做，hardcode）

- rubric 页面
  - 查看 rubric
  - 创建 rubric
    - 添加关联的 criterion
    - 添加 criterion 的 band
  - 编辑 rubric
    - 添加关联的 rubric
    - 添加 rubric 的 band
- criterion 页面
  - 查看 criterion
  - 创建 criterion
  - 编辑 criterion
- 人工评分页面
  - attempt 列表
  - attempt 细节 + task 对应的 rubric
  - attempt 校验
    - AI 评分细节
- scenario 页面
  - 查看 scenario
  - 编辑 scenario
    - metadata
    - 任务列表

### 学生端

- dashboard
  - 历史 attempt
- scenario 列表
  - 练习|正式模式切换
  - 只包含 scenario 4
- preflight 页面
  - 设备检测
  - 协议同意
- scenario 任务页面
- 并行的多个 task N 页面
- 提交确认页面（检查清单 + 确认按钮）
- scenario 侧栏（进度+倒计时）
- 提交后等待评分的页面(hardcode)
- result 报告页
  - cefr
  - domain * competence
- attempt 历史页面
- competence 矩阵浏览
- profile 个人中心

## 页面细节设计

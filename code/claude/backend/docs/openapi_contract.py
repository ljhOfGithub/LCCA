"""OpenAPI Contract Documentation for LCCA API.

This document describes the complete API contract for the LCCA Online
English Assessment System.

Base URL: http://localhost:8000
API Version: v1
OpenAPI Spec: /openapi.json

## Authentication

All protected endpoints require Bearer token authentication:
```
Authorization: Bearer <access_token>
```

## Common Responses

All endpoints may return these standard error responses:

| Status | Description |
|--------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid or missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 422 | Validation Error - Request validation failed |
| 500 | Internal Server Error |

## Rate Limiting

API is rate-limited to 100 requests per minute per user.

---
"""
from app.api.schemas.common import *

# =============================================================================
# HEALTH & INFO ENDPOINTS
# =============================================================================
"""
GET /api/v1/health
- Description: Basic health check
- Auth: None
- Response: { "status": "healthy" }

GET /api/v1/ready
- Description: Readiness check (includes DB/Redis)
- Auth: None
- Response: { "status": "ready", "database": "ok", "redis": "ok" }

GET /api/v1/
- Description: Service information
- Auth: None
- Response: { "name": "LCCA Exam System", "version": "1.0.0" }
"""

# =============================================================================
# AUTHENTICATION ENDPOINTS (TODO: Implement)
# =============================================================================
"""
POST /api/v1/auth/register
- Description: Register new user
- Auth: None
- Request: { "email", "password", "full_name", "role" }
- Response: UserResponse

POST /api/v1/auth/login
- Description: Login and get JWT token
- Auth: None
- Request: { "email", "password" }
- Response: { "access_token", "token_type", "expires_in", "user" }

POST /api/v1/auth/refresh
- Description: Refresh access token
- Auth: None
- Request: { "refresh_token" }
- Response: TokenResponse

POST /api/v1/auth/logout
- Description: Logout (invalidate token)
- Auth: Required
- Response: { "message": "Logged out" }

POST /api/v1/auth/password-reset
- Description: Request password reset email
- Auth: None
- Request: { "email" }
- Response: { "message": "Reset email sent" }
"""

# =============================================================================
# USER ENDPOINTS
# =============================================================================
"""
GET /api/v1/users/me
- Description: Get current user profile
- Auth: Required
- Response: UserResponse

PATCH /api/v1/users/me
- Description: Update current user profile
- Auth: Required
- Request: { "full_name", "password" }
- Response: UserResponse

GET /api/v1/users/me/stats
- Description: Get user statistics (attempts, scores)
- Auth: Required
- Response: { "user_id", "total_attempts", "completed_attempts", "average_score" }

GET /api/v1/users (Admin only)
- Description: List all users
- Auth: Admin
- Query: ?page=1&per_page=20&role=student
- Response: { "items": [], "total", "page", "per_page" }

GET /api/v1/users/{user_id}
- Description: Get user by ID
- Auth: Admin
- Response: UserResponse

PATCH /api/v1/users/{user_id}
- Description: Update user
- Auth: Admin
- Request: { "is_active", "role" }
- Response: UserResponse
"""

# =============================================================================
# SCENARIO ENDPOINTS
# =============================================================================
"""
GET /api/v1/scenarios
- Description: List available scenarios
- Auth: Student+
- Query: ?page=1&per_page=20&status=published&tags=ielts,toefl
- Response: { "items": [], "total", "page", "per_page" }

GET /api/v1/scenarios/{scenario_id}
- Description: Get scenario details with tasks
- Auth: Student+
- Response: ScenarioDetailResponse

GET /api/v1/scenarios/{scenario_id}/tasks
- Description: List tasks for a scenario
- Auth: Student+
- Response: { "items": [], "total" }

GET /api/v1/scenarios/{scenario_id}/tasks/{task_index}
- Description: Get task details (prompt, rubric)
- Auth: Student+ (valid attempt required)
- Response: TaskDetailResponse

GET /api/v1/scenarios/{scenario_id}/tasks/{task_index}/prompt
- Description: Get task prompt content
- Auth: Student+ (valid attempt required)
- Response: PromptResponse
"""

# =============================================================================
# ATTEMPT ENDPOINTS
# =============================================================================
"""
POST /api/v1/attempts
- Description: Create new exam attempt
- Auth: Student+
- Request: { "scenario_id" }
- Response: { "id", "student_id", "scenario_id", "status" }

GET /api/v1/attempts
- Description: List user's attempts
- Auth: Student+ (own) or Admin (all)
- Query: ?user_id=&page=1&per_page=20&status=in_progress
- Response: { "items": [], "total", "page", "per_page" }

GET /api/v1/attempts/{attempt_id}
- Description: Get attempt details
- Auth: Owner or Admin
- Response: AttemptDetailResponse

POST /api/v1/attempts/{attempt_id}/start
- Description: Start/resume an attempt
- Auth: Owner
- Response: { "id", "status", "started_at", "expires_at" }

POST /api/v1/attempts/{attempt_id}/submit
- Description: Submit an attempt
- Auth: Owner
- Request: { "confirmation": true }
- Response: AttemptDetailResponse

GET /api/v1/attempts/{attempt_id}/time-status
- Description: Get time remaining
- Auth: Owner
- Response: { "is_expired", "remaining_seconds", "started_at", "expires_at" }

POST /api/v1/attempts/{attempt_id}/finalize
- Description: Force finalize attempt (admin/timeout)
- Auth: Admin or System
- Request: { "reason": "timeout|manual|admin" }
- Response: { "id", "status", "message" }
"""

# =============================================================================
# TASK RESPONSE ENDPOINTS
# =============================================================================
"""
POST /api/v1/attempts/{attempt_id}/responses
- Description: Start a task response
- Auth: Owner
- Request: { "task_id" }
- Response: { "id", "task_id", "status", "started_at" }

GET /api/v1/attempts/{attempt_id}/responses
- Description: List task responses for an attempt
- Auth: Owner or Admin
- Response: { "items": [] }

GET /api/v1/attempts/{attempt_id}/responses/{response_id}
- Description: Get task response details
- Auth: Owner or Admin
- Response: TaskResponseDetail

POST /api/v1/attempts/{attempt_id}/responses/{response_id}/submit
- Description: Submit a task response
- Auth: Owner
- Response: TaskResponseDetail
"""

# =============================================================================
# ARTIFACT ENDPOINTS
# =============================================================================
"""
POST /api/v1/artifacts/upload-url
- Description: Get pre-signed upload URL
- Auth: Student+
- Request: { "task_response_id", "artifact_type", "filename", "content_type", "size_bytes" }
- Response: { "upload_url", "artifact_id", "expires_at" }

POST /api/v1/artifacts/{artifact_id}/confirm
- Description: Confirm upload completion
- Auth: Owner
- Response: ArtifactResponse

GET /api/v1/artifacts/{artifact_id}
- Description: Get artifact details
- Auth: Owner or Admin
- Response: ArtifactResponse

DELETE /api/v1/artifacts/{artifact_id}
- Description: Delete artifact
- Auth: Owner or Admin
- Response: { "id", "message" }

GET /api/v1/attempts/{attempt_id}/artifacts
- Description: List artifacts for an attempt
- Auth: Owner or Admin
- Response: { "items": [] }
"""

# =============================================================================
# SCORING ENDPOINTS
# =============================================================================
"""
POST /api/v1/scoring/trigger
- Description: Trigger scoring for an attempt
- Auth: System or Admin
- Request: { "attempt_id", "scoring_type": "auto|manual", "priority" }
- Response: { "job_id", "attempt_id", "status", "message" }

GET /api/v1/scoring/runs
- Description: List score runs
- Auth: Admin or Teacher
- Query: ?attempt_id=&status=running
- Response: { "items": [], "total", "page", "per_page" }

GET /api/v1/scoring/runs/{run_id}
- Description: Get score run details
- Auth: Admin, Teacher, or Owner (own attempts)
- Response: ScoreRunResponse

GET /api/v1/scoring/runs/{run_id}/details
- Description: Get detailed scores
- Auth: Admin, Teacher, or Owner
- Response: { "items": [{ "criterion", "score", "max_score", "feedback" }] }

POST /api/v1/scoring/manual
- Description: Submit manual scores
- Auth: Teacher or Admin
- Request: { "score_run_id", "scores": [], "overall_feedback", "scorer_id" }
- Response: { "score_run_id", "status", "message" }
"""

# =============================================================================
# RESULTS ENDPOINTS
# =============================================================================
"""
GET /api/v1/results/attempts/{attempt_id}
- Description: Get attempt results
- Auth: Owner or Admin
- Response: { "attempt_id", "total_score", "max_score", "percentage", "breakdown" }

GET /api/v1/results/me
- Description: Get current user's results
- Auth: Student
- Query: ?page=1&per_page=20
- Response: { "items": [], "total" }
"""

# =============================================================================
# TIMEOUT ENDPOINTS
# =============================================================================
"""
GET /api/v1/timeout/stats
- Description: Get timeout finalization statistics
- Auth: Admin
- Query: ?since_hours=24
- Response: { "finalized_count", "since_hours", "timeout_count", "manual_count" }

GET /api/v1/timeout/config
- Description: Get timeout configuration
- Auth: None
- Response: { "attempt_timeout_seconds", "attempt_timeout_minutes" }
"""

# =============================================================================
# ADMIN ENDPOINTS
# =============================================================================
"""
POST /api/v1/admin/scenarios
- Description: Create new scenario
- Auth: Teacher or Admin
- Request: { "title", "description", "tasks": [], "duration_minutes" }
- Response: ScenarioResponse

PATCH /api/v1/admin/scenarios/{scenario_id}
- Description: Update scenario
- Auth: Teacher or Admin
- Request: { ... }
- Response: ScenarioResponse

POST /api/v1/admin/scenarios/{scenario_id}/publish
- Description: Publish a scenario
- Auth: Admin
- Response: ScenarioResponse

GET /api/v1/admin/audit-log
- Description: Get audit log
- Auth: Admin
- Query: ?user_id=&action=&since=
- Response: { "items": [], "total" }
"""
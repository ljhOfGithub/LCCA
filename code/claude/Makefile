.PHONY: help up down backend worker api logs clean db-migrate db-reset db-shell restart

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# Docker Compose commands
up: ## Start all services (backend, postgres, redis, minio)
	docker compose up -d
	@echo "Services started. Access:"
	@echo "  - API: http://localhost:8000"
	@echo "  - MinIO Console: http://localhost:9001"
	@echo "  - pgAdmin: http://localhost:5050"
	@echo "  - PostgreSQL: localhost:5432"
	@echo "  - Redis: localhost:6379"

down: ## Stop all services
	docker compose down

logs: ## View logs (all services)
	docker compose logs -f

logs-backend: ## View backend logs
	docker compose logs -f backend

logs-postgres: ## View PostgreSQL logs
	docker compose logs -f postgres

logs-redis: ## View Redis logs
	docker compose logs -f redis

logs-minio: ## View MinIO logs
	docker compose logs -f minio

# Backend service commands
backend: ## Start all services including backend
	docker compose up -d backend

backend-rebuild: ## Rebuild and start backend service
	docker compose up -d --build backend

api: ## Start FastAPI dev server with live reload (local)
	cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

worker: ## Start ARQ worker (local)
	cd backend && python -m arq app.workers.tasks:WorkerSettings

# Database commands
db-migrate: ## Run Alembic migrations
	cd backend && alembic upgrade head

db-reset: ## Reset database (drop all tables and recreate)
	cd backend && alembic downgrade base && alembic upgrade head

db-shell: ## Connect to PostgreSQL shell
	docker compose exec postgres psql -U lcca_user -d lcca_exam

db-shell-backend: ## Run database shell (local psql)
	psql $$(cat backend/.env 2>/dev/null | grep DATABASE_URL | cut -d'=' -f2) || echo "Set DATABASE_URL in backend/.env"

# Maintenance
clean: ## Remove all containers and volumes
	docker compose down -v
	docker compose rm -f

restart: ## Restart all services
	docker compose restart

restart-backend: ## Restart only backend service
	docker compose restart backend

# Build commands
build-backend: ## Build backend Docker image
	docker compose build backend

# Shell access
shell-backend: ## Get shell inside backend container
	docker compose exec backend /bin/bash
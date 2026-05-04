# LCCA - Online English Assessment Exam System

Development environment setup using Docker Compose.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Python 3.10+ (for local development)

## Services

| Service   | Port  | Description                        |
|-----------|-------|------------------------------------|
| PostgreSQL| 5432  | Primary database                   |
| Redis     | 6379  | Queue & cache                      |
| MinIO     | 9000  | S3-compatible object storage (API) |
| MinIO     | 9001  | MinIO Console                      |
| pgAdmin   | 5050  | Database management UI             |

## Quick Start

### 1. Clone and setup environment

```bash
# Copy environment file
cp .env.example .env
```

### 2. Start services

```bash
make up
```

Or directly with Docker Compose:

```bash
docker compose up -d
```

### 3. Verify services

```bash
docker compose ps
```

## Common Tasks

### Start all services
```bash
make up
```

### Stop all services
```bash
make down
```

### View logs
```bash
make logs
```

### Run database migrations
```bash
make db-migrate
```

### Reset database
```bash
make db-reset
```

### Connect to PostgreSQL shell
```bash
make db-shell
```

### Start ARQ worker
```bash
make worker
```

### Clean up (remove containers and volumes)
```bash
make clean
```

## Service URLs

| Service  | URL                                | Credentials          |
|----------|------------------------------------|----------------------|
| API      | http://localhost:8000              | -                    |
| MinIO    | http://localhost:9001              | minioadmin/minioadmin|
| pgAdmin  | http://localhost:5050              | admin@lcca.local / admin123 |
| PostgreSQL| localhost:5432                    | lcca_user/lcca_password |

## MinIO Setup

The `lcca-artifacts` bucket is automatically created on startup.

### Using mc (MinIO Client)

```bash
# Connect to MinIO
docker compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin

# List buckets
docker compose exec minio mc ls local/

# Set bucket policy for public access
docker compose exec minio mc anonymous set download local/lcca-artifacts
```

## Database Management

### pgAdmin

1. Open http://localhost:5050
2. Login with `admin@lcca.local` / `admin123`
3. Add server:
   - Host: `postgres`
   - Port: `5432`
   - Database: `lcca_exam`
   - Username: `lcca_user`
   - Password: `lcca_password`

### Alembic Migrations

```bash
# Generate migration
alembic revision --autogenerate -m "description"

# Run migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Environment Variables

Copy `.env.example` to `.env` and adjust values:

```bash
cp .env.example .env
```

Key variables:
- `DATABASE_URL` - Async PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `S3_ENDPOINT_URL` - MinIO API endpoint
- `S3_ACCESS_KEY` / `S3_SECRET_KEY` - MinIO credentials
- `S3_BUCKET` - Default bucket name

## Troubleshooting

### Services not starting
```bash
docker compose logs <service-name>
```

### Database connection issues
```bash
docker compose exec postgres pg_isready -U lcca_user -d lcca_exam
```

### Redis connection issues
```bash
docker compose exec redis redis-cli ping
```

### MinIO health check
```bash
docker compose exec minio mc ready local
```

### Reset everything
```bash
docker compose down -v --remove-orphans
docker compose up -d
```
"""FastAPI application entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1 import attempts, auth, scoring, health, timeout as timeout_routes, results, artifacts
from app.api.v1.admin import scenarios as admin_scenarios
from app.api.v1.teacher import rubrics, scenarios as teacher_scenarios, tasks
from app.api.v1.student_api import scenarios as student_scenarios
from app.api.v1.rater import human


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup - could initialize connections here
    yield
    # Shutdown - cleanup resources here


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register API routers
    app.include_router(health.router, prefix="/api/v1", tags=["health"])
    app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
    app.include_router(student_scenarios.router, prefix="/api/v1", tags=["student-scenarios"])
    app.include_router(attempts.router, prefix="/api/v1/attempts", tags=["attempts"])
    app.include_router(scoring.router, prefix="/api/v1", tags=["scoring"])
    app.include_router(timeout_routes.router, prefix="/api/v1", tags=["timeout"])
    app.include_router(results.router, prefix="/api/v1", tags=["results"])
    app.include_router(artifacts.router, prefix="/api/v1/artifacts", tags=["artifacts"])

    # Teacher endpoints
    app.include_router(rubrics.router, prefix="/api/v1/teacher", tags=["teacher-rubrics"])
    app.include_router(teacher_scenarios.router, prefix="/api/v1/teacher", tags=["teacher-scenarios"])
    app.include_router(tasks.router, prefix="/api/v1/teacher", tags=["teacher-tasks"])

    # Admin endpoints
    app.include_router(admin_scenarios.router, prefix="/api/v1/admin", tags=["admin-scenarios"])

    # Rater endpoints
    app.include_router(human.router, prefix="/api/v1/rater", tags=["rater"])

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)